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
  test(`${model.provider}: full mocked host flow never fetches, authenticates, or persists base64`, async (t) => {
    const ws = await workspace(t); const h = harness(model, ws); registerReadVideo(h.pi, h.options); await h.emit('session_start');
    const oldFetch = globalThis.fetch; globalThis.fetch = () => { throw new Error('No network calls are allowed'); };
    try {
      const tool = h.tools.get('read_video');
      const result = await tool.execute('call_1', { path: '@clip.mp4' }, undefined, undefined, h.ctx);
      assert.equal(containsBytes(result), false);
      await h.emit('context', { messages: [message(result)] });
      const payload = model === KIMI ? kimiPayload(result.details.readVideo) : geminiPayload(result.details.readVideo);
      const next = await h.emit('before_provider_request', { payload });
      assert.equal(containsBytes(next), true);
      assert.ok(!JSON.stringify(next).includes('ms://')); assert.ok(!JSON.stringify(next).includes('fileData'));
      assert.match(tool.renderResult(result, { expanded: true }).text, /Inline video prepared/);
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
test('source has no upload clients, credential lookup, dynamic execution, or refresh tool argument', async () => {
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
  for (const pattern of [/\bfetch\s*\(/, /new FormData/, /getProviderAuth\s*\(/, /getApiKey/, /\beval\s*\(/, /registerCommand\s*\(/, /files\.create/]) {
    assert.ok(!pattern.test(source), `Forbidden runtime operation: ${pattern}`);
  }
});
