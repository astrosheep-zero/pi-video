import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { registerReadVideo } from '../src/pi-extension.ts';
import { KIMI, GEMINI, CONFIG, BYTES, workspace, harness, message, kimiPayload, geminiPayload, containsBytes } from './helpers.mjs';

test('registers only read_video, no /video and no input/@ hook', async (t) => {
  const ws = await workspace(t); const h = harness(KIMI, ws); registerReadVideo(h.pi, h.options);
  assert.deepEqual([...h.tools.keys()], ['read_video']); assert.equal(h.events.has('input'), false);
  await h.emit('session_start'); assert.ok(h.active.includes('read_video')); assert.ok(h.active.includes('other_plugin'));
  assert.deepEqual(h.tools.get('read_video').parameters.required, ['path']);
});
test('model events enable/disable only the owned tool', async (t) => {
  const ws = await workspace(t); const h = harness(KIMI, ws); registerReadVideo(h.pi, h.options); await h.emit('session_start');
  h.ctx.model = { provider: 'anthropic', id: 'unsupported', api: 'anthropic-messages' };
  await h.emit('model_select', { model: h.ctx.model });
  assert.ok(!h.active.includes('read_video')); assert.ok(h.active.includes('read')); assert.ok(h.active.includes('other_plugin'));
  h.ctx.model = GEMINI; await h.emit('model_select', { model: GEMINI }); assert.ok(h.active.includes('read_video'));
});
test('ordinary read blocks video paths but not normal text files', async (t) => {
  const ws = await workspace(t); const h = harness(KIMI, ws); registerReadVideo(h.pi, h.options); await h.emit('session_start');
  assert.equal((await h.emit('tool_call', { toolName: 'read', input: { path: '@clip.mp4' } })).block, true);
  assert.equal(await h.emit('tool_call', { toolName: 'read', input: { path: 'main.ts' } }), undefined);
});
test('config is reloaded per user turn; invalid config warns without leaking its content', async (t) => {
  const ws = await workspace(t); const h = harness(KIMI, ws); registerReadVideo(h.pi, h.options); await h.emit('session_start');
  await writeFile(join(ws.agentDir, 'models.json'), '{"secret":"never-print","providers":{"kimi-coding":{"video":"yes"}}}');
  await h.emit('before_agent_start'); assert.ok(!h.active.includes('read_video'));
  assert.equal(h.notifications.length, 1); assert.ok(!h.notifications.join().includes('never-print'));
  await h.emit('before_agent_start'); assert.equal(h.notifications.length, 1);
  await writeFile(join(ws.agentDir, 'models.json'), CONFIG); await h.emit('before_agent_start'); assert.ok(h.active.includes('read_video'));
});
for (const model of [KIMI, GEMINI]) {
  test(`${model.provider}: full host flow uses the intended transport without persisting bytes or IDs`, async (t) => {
    const ws = await workspace(t); const h = harness(model, ws);
    let uploads = 0, authCalls = 0;
    h.options.fetch = async () => { uploads++; return Response.json({ id: 'file-private' }); };
    h.ctx.modelRegistry.getApiKeyAndHeaders = async () => { authCalls++; return { ok: true, apiKey: 'fake-key' }; };
    registerReadVideo(h.pi, h.options); await h.emit('session_start');
    const oldFetch = globalThis.fetch; globalThis.fetch = () => { throw new Error('No network calls are allowed'); };
    try {
      const tool = h.tools.get('read_video');
      const result = await tool.execute('call_1', { path: '@clip.mp4' }, undefined, undefined, h.ctx);
      assert.equal(containsBytes(result), false);
      assert.ok(!JSON.stringify(result).includes('file-private'));
      await h.emit('context', { messages: [message(result)] });
      const payload = model === KIMI ? kimiPayload(result.details.readVideo) : geminiPayload(result.details.readVideo);
      const next = await h.emit('before_provider_request', { payload });
      assert.equal(containsBytes(next), model === GEMINI);
      assert.equal(JSON.stringify(next).includes('ms://file-private'), model === KIMI);
      assert.equal(uploads, model === KIMI ? 1 : 0);
      assert.equal(authCalls, model === KIMI ? 2 : 0);
      assert.ok(!JSON.stringify(next).includes('fileData'));
      assert.match(tool.renderResult(result, { expanded: true }).text, /Video prepared/);
      await h.emit('session_shutdown');
      const context = await h.emit('context', { messages: [message(result)] });
      assert.match(context.messages[0].content[0].text, /NOT provided/);
    } finally { globalThis.fetch = oldFetch; }
  });
}
for (const hasUI of [true, false]) {
  test(`parallel external video reads need no UI (hasUI=${hasUI})`, async (t) => {
    const ws = await workspace(t); const h = harness(KIMI, ws);
    h.ctx.hasUI = hasUI;
    h.ctx.ui.confirm = async () => { throw new Error('Unexpected confirmation'); };
    registerReadVideo(h.pi, h.options); await h.emit('session_start');
    const paths = [join(ws.root, 'upload-a.mp4'), join(ws.root, 'upload-b.mp4')];
    await Promise.all(paths.map((path) => writeFile(path, BYTES)));
    const results = await Promise.all(paths.map((path, i) =>
      h.tools.get('read_video').execute(`call_${i}`, { path }, undefined, undefined, h.ctx)));
    assert.equal(results.length, 2);
    assert.ok(results.every((result) => result.details.readVideo.size === BYTES.length));
    assert.equal(h.notifications.length, 0);
  });
}
test('tree navigation drops resident bytes and preserves other tools', async (t) => {
  const ws = await workspace(t); const h = harness(KIMI, ws); registerReadVideo(h.pi, h.options); await h.emit('session_start');
  const result = await h.tools.get('read_video').execute('call_1', { path: ws.path }, undefined, undefined, h.ctx);
  await h.emit('session_tree'); const context = await h.emit('context', { messages: [message(result)] });
  assert.match(context.messages[0].content[0].text, /NOT provided/); assert.ok(h.active.includes('other_plugin'));
});
test('source has no dynamic execution or slash commands', async () => {
  async function all(directory) {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) result.push(...await all(path));
      else if (entry.name.endsWith('.ts')) result.push(await readFile(path, 'utf8'));
    }
    return result.join('\n');
  }
  const source = await all(new URL('../src/', import.meta.url).pathname);
  for (const pattern of [/\beval\s*\(/, /registerCommand\s*\(/]) {
    assert.ok(!pattern.test(source), `Forbidden runtime operation: ${pattern}`);
  }
});
test('Pi account changes block historical remote IDs until the video is read again', async (t) => {
  const ws = await workspace(t); const h = harness(KIMI, ws);
  let key = 'account-a', uploads = 0;
  h.ctx.modelRegistry.getApiKeyAndHeaders = async () => ({ ok: true, apiKey: key });
  h.options.fetch = async () => Response.json({ id: `file-${++uploads}` });
  registerReadVideo(h.pi, h.options); await h.emit('session_start');
  const result = await h.tools.get('read_video').execute('call_1', { path: ws.path }, undefined, undefined, h.ctx);
  await h.emit('context', { messages: [message(result)] }); key = 'account-b';
  const next = await h.emit('before_provider_request', { payload: kimiPayload(result.details.readVideo) });
  assert.ok(!JSON.stringify(next).includes('ms://file-1'));
  assert.match(JSON.stringify(next), /NOT provided/);
  await h.tools.get('read_video').execute('call_2', { path: ws.path }, undefined, undefined, h.ctx);
  assert.equal(uploads, 2);
});
test('Pi auth-resolution failures are sanitized and never upload', async (t) => {
  const ws = await workspace(t); const h = harness(KIMI, ws);
  h.ctx.modelRegistry.getApiKeyAndHeaders = async () => ({ ok: false, error: 'secret credential details' });
  h.options.fetch = async () => { throw new Error('unexpected upload'); };
  registerReadVideo(h.pi, h.options); await h.emit('session_start');
  await assert.rejects(h.tools.get('read_video').execute('call_1', { path: ws.path }, undefined, undefined, h.ctx),
    (e) => /credentials/.test(e.message) && !e.message.includes('secret'));
});
