import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { VideoService } from '../src/service.ts';
import { VideoStore } from '../src/store.ts';
import { encodeVideo } from '../src/media.ts';
import { CONFIG, KIMI, GEMINI, BYTES, workspace, message, kimiPayload, geminiPayload, containsBytes } from './helpers.mjs';

for (const model of [KIMI, GEMINI]) {
  const makePayload = model === KIMI ? kimiPayload : geminiPayload;
  test(`${model.provider}: read -> authorized context -> inline request; no data persisted`, async (t) => {
    const ws = await workspace(t); const service = new VideoService(); service.configure(CONFIG); service.selectModel(model);
    const result = await service.read('@clip.mp4', 'call_1', { cwd: ws.cwd, model });
    assert.equal(containsBytes(result), false);
    assert.ok(!JSON.stringify(result).includes('inlineData'));
    // A marker cannot trigger injection before its tool-result provenance is checked.
    assert.equal(service.rewrite(makePayload(result.details.readVideo), model).videos, 0);
    const input = [message(result)]; const snapshot = structuredClone(input);
    const context = service.prepareContext(input, model);
    assert.deepEqual(input, snapshot); assert.deepEqual(context, input);
    const request = service.rewrite(makePayload(result.details.readVideo), model);
    assert.equal(request.videos, 1); assert.equal(containsBytes(request.payload), true);
    service.reset();
  });
}
test('reset/resume cannot silently reread files from persisted session metadata', async (t) => {
  const ws = await workspace(t); const service = new VideoService(); service.configure(CONFIG);
  const result = await service.read(ws.path, 'call_1', { cwd: ws.cwd, model: GEMINI });
  service.reset(); await rm(ws.path);
  const context = service.prepareContext([message(result)], GEMINI);
  assert.match(context[0].content[0].text, /NOT provided/);
  assert.equal(service.rewrite(geminiPayload(result.details.readVideo), GEMINI).videos, 0);
});
test('copying a marker into user text or a different tool result does not authorize it', async (t) => {
  const ws = await workspace(t); const service = new VideoService(); service.configure(CONFIG);
  const result = await service.read(ws.path, 'call_1', { cwd: ws.cwd, model: KIMI });
  for (const msg of [message(result, { role: 'user' }), message(result, { toolName: 'read' }),
    message(result, { toolCallId: 'forged' }), message(result, { isError: true })]) {
    const context = service.prepareContext([msg], KIMI);
    assert.match(context[0].content[0].text, /NOT provided/);
    assert.equal(service.rewrite(kimiPayload(result.details.readVideo), KIMI).videos, 0);
  }
});
for (const model of [KIMI, GEMINI]) {
  test(`${model.provider}: changing both original IDs cannot authorize a genuine marker`, async (t) => {
    const ws = await workspace(t); const service = new VideoService(); service.configure(CONFIG);
    const result = await service.read(ws.path, 'call_1', { cwd: ws.cwd, model });
    const forged = structuredClone(result);
    forged.details.readVideo.callId = 'forged-original';
    const context = service.prepareContext([message(forged, { toolCallId: 'forged-original' })], model);
    assert.match(context[0].content[0].text, /NOT provided/);
    const payload = model === KIMI ? kimiPayload(forged.details.readVideo) : geminiPayload(forged.details.readVideo);
    assert.equal(service.rewrite(payload, model).videos, 0);
  });
  test(`${model.provider}: a user copy is stripped even when the genuine result authorizes its marker`, async (t) => {
    const ws = await workspace(t); const service = new VideoService(); service.configure(CONFIG);
    const result = await service.read(ws.path, 'call_1', { cwd: ws.cwd, model });
    const context = service.prepareContext([message(result), { role: 'user', content: result.details.readVideo.marker }], model);
    assert.match(context[1].content, /NOT provided/);
    assert.ok(!context[1].content.includes(result.details.readVideo.marker));
  });
}
test('model switch does not leak resident Kimi bytes to Gemini', async (t) => {
  const ws = await workspace(t); const service = new VideoService(); service.configure(CONFIG); service.selectModel(KIMI);
  const result = await service.read(ws.path, 'call_1', { cwd: ws.cwd, model: KIMI });
  service.selectModel(GEMINI);
  assert.match(service.prepareContext([message(result)], GEMINI)[0].content[0].text, /NOT provided/);
  assert.equal(service.rewrite(geminiPayload(result.details.readVideo), GEMINI).videos, 0);
  // Switching back is allowed only after the original tool result is in context again.
  service.selectModel(KIMI); service.prepareContext([message(result)], KIMI);
  assert.equal(service.rewrite(kimiPayload(result.details.readVideo), KIMI).videos, 1);
});
test('turning video off after context preparation still blocks request injection', async (t) => {
  const ws = await workspace(t); const service = new VideoService(); service.configure(CONFIG);
  const result = await service.read(ws.path, 'call_1', { cwd: ws.cwd, model: KIMI });
  service.prepareContext([message(result)], KIMI); service.configure('{}');
  assert.equal(service.rewrite(kimiPayload(result.details.readVideo), KIMI).videos, 0);
  await assert.rejects(service.read(ws.path, 'call_2', { cwd: ws.cwd, model: KIMI }), /not enabled/);
});
test('invalid policy fails closed instead of keeping previous enabled state', async (t) => {
  const ws = await workspace(t); const service = new VideoService(); service.configure(CONFIG);
  assert.throws(() => service.configure('not json'));
  assert.equal(service.route(KIMI), undefined);
  service.configure(CONFIG); await writeFile(join(ws.agentDir, 'models.json'), '{bad');
  await assert.rejects(service.loadPolicy(join(ws.agentDir, 'models.json')));
  assert.equal(service.route(KIMI), undefined);
});
test('external files are read directly without a confirmation callback', async (t) => {
  const ws = await workspace(t); const path = join(ws.root, 'outside.mp4'); await writeFile(path, BYTES);
  let encodes = 0;
  const service = new VideoService({ encode: async (...args) => { encodes++; return encodeVideo(...args); } }); service.configure(CONFIG);
  const result = await service.read(path, 'call_1', { cwd: ws.cwd, model: KIMI });
  assert.equal(encodes, 1); assert.equal(containsBytes(result), false);
});
test('reset during a pending read cancels it without committing resident data', async (t) => {
  const ws = await workspace(t); const store = new VideoStore(); let release;
  const started = new Promise((resolve) => { release = resolve; });
  const service = new VideoService({ store, encode: async (_video, signal) => {
    release(); return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } }); service.configure(CONFIG);
  const read = service.read(ws.path, 'call_1', { cwd: ws.cwd, model: KIMI });
  await started; service.reset(); await assert.rejects(read);
  assert.equal(store.bytes, 0); assert.equal(store.size, 0);
});
test('model selection cancels a pending read', async (t) => {
  const ws = await workspace(t); let started;
  const barrier = new Promise((resolve) => { started = resolve; });
  const service = new VideoService({ encode: async (_video, signal) => {
    started(); return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } }); service.configure(CONFIG); service.selectModel(KIMI);
  const read = service.read(ws.path, 'call_1', { cwd: ws.cwd, model: KIMI });
  await barrier; service.selectModel(GEMINI); await assert.rejects(read);
});
test('parallel tool calls serialize encoding and release the queue after errors', async (t) => {
  const ws = await workspace(t); let count = 0, active = 0, peak = 0;
  const service = new VideoService({ encode: async (...args) => {
    count++; active++; peak = Math.max(peak, active);
    try { await new Promise((resolve) => setTimeout(resolve, 5)); if (count === 1) throw new Error('first fails'); return await encodeVideo(...args); }
    finally { active--; }
  } }); service.configure(CONFIG);
  const results = await Promise.allSettled([
    service.read(ws.path, 'call_1', { cwd: ws.cwd, model: KIMI }),
    service.read(ws.path, 'call_2', { cwd: ws.cwd, model: KIMI }),
  ]);
  assert.equal(peak, 1); assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
});
test('evicted bytes produce explicit unavailable context, never an implicit disk read', async (t) => {
  const ws = await workspace(t); const service = new VideoService({ store: new VideoStore(1000, 1) }); service.configure(CONFIG);
  const old = await service.read(ws.path, 'call_1', { cwd: ws.cwd, model: KIMI });
  await service.read(ws.path, 'call_2', { cwd: ws.cwd, model: KIMI });
  assert.match(service.prepareContext([message(old)], KIMI)[0].content[0].text, /NOT provided/);
});

test('assistant text and attached text signatures are never rewritten', async (t) => {
  const ws = await workspace(t); const service = new VideoService(); service.configure(CONFIG);
  const result = await service.read(ws.path, 'call_1', { cwd: ws.cwd, model: GEMINI });
  const assistant = { role: 'assistant', content: [{ type: 'text', text: result.details.readVideo.marker, textSignature: 'opaque-signature' }] };
  const output = service.prepareContext([assistant], GEMINI);
  assert.strictEqual(output[0], assistant);
  assert.equal(service.rewrite(geminiPayload(result.details.readVideo), GEMINI).videos, 0);
});
