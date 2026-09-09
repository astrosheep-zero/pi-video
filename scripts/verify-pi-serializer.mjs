// Explicit SDK integration check, not part of the dependency-free unit suite.
// Run: npm run test:pi
// Capture Pi's real provider payload in onPayload and stop BEFORE HTTP.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stream as anthropicStream } from '@earendil-works/pi-ai/api/anthropic-messages';
import { stream as googleStream } from '@earendil-works/pi-ai/api/google-generative-ai';
import { VideoService } from '../src/service.ts';
import { KIMI, GEMINI, CONFIG, workspace, message } from '../test/helpers.mjs';

for (const scenario of [
  { model: KIMI, nextId: 'k3', stream: anthropicStream, hasIds: true },
  { model: { ...GEMINI, id: 'gemini-3-flash-preview' }, nextId: 'gemini-3-pro-preview', stream: googleStream, hasIds: true },
  { model: { ...GEMINI, id: 'gemini-2.5-flash' }, nextId: 'gemini-2.5-pro', stream: googleStream, hasIds: false },
]) {
  const origin = { ...scenario.model, input: ['text', 'image'], reasoning: false, maxTokens: 1024,
    contextWindow: 128000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
  for (const switched of [false, true]) {
    for (const id of ['toolu_01AbC', 'call:1', 'x'.repeat(80)]) {
      test(`real Pi ${origin.id}: switched=${switched}, id=${id.slice(0, 20)}`, async (t) => {
        const ws = await workspace(t);
        const service = new VideoService(); service.configure(CONFIG); service.selectModel(origin);
        const result = await service.read(ws.path, id, { cwd: ws.cwd, model: origin });
        const target = switched ? { ...origin, id: scenario.nextId } : origin;
        service.selectModel(target);
        const assistant = { role: 'assistant', provider: origin.provider, api: origin.api, model: origin.id,
          stopReason: 'toolUse', timestamp: 0,
          content: [{ type: 'toolCall', id, name: 'read_video', arguments: { path: ws.path }, thoughtSignature: 'c2ln' }] };
        const source = [assistant, message(result, { toolCallId: id })];
        const sourceSnapshot = structuredClone(source);
        const messages = service.prepareContext(source, target);
        let payload;
        const oldFetch = globalThis.fetch;
        let networkCalls = 0;
        globalThis.fetch = async () => { networkCalls++; throw new Error('HTTP forbidden'); };
        try {
          await scenario.stream(target, { messages }, { apiKey: 'offline-fixture-not-a-key',
            onPayload(value) { payload = value; throw new Error('Captured; stop before HTTP'); } }).result();
        } finally { globalThis.fetch = oldFetch; }
        assert.equal(networkCalls, 0);
        assert.ok(payload, 'SDK must reach the real onPayload hook');
        // This is a test of Pi's observed behavior, NOT a rule implemented by the extension.
        const expectedId = !scenario.hasIds ? undefined
          : switched ? id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) : id;
        if (origin.provider === KIMI.provider) {
          const blocks = payload.messages.flatMap((m) => Array.isArray(m.content) ? m.content : []);
          assert.equal(blocks.find((b) => b.type === 'tool_use').id, expectedId);
          assert.equal(blocks.find((b) => b.type === 'tool_result').tool_use_id, expectedId);
        } else {
          const parts = payload.contents.flatMap((c) => c.parts ?? []);
          assert.equal(parts.find((p) => p.functionCall).functionCall.id, expectedId);
          assert.equal(parts.find((p) => p.functionResponse).functionResponse.id, expectedId);
        }
        const snapshot = structuredClone(payload);
        const rewritten = service.rewrite(payload, target);
        assert.equal(rewritten.videos, 1);
        assert.equal(rewritten.omitted, 0);
        assert.deepEqual(payload, snapshot);
        assert.deepEqual(source, sourceSnapshot);
        const key = origin.provider === KIMI.provider ? 'messages' : 'contents';
        const role = origin.provider === KIMI.provider ? 'assistant' : 'model';
        assert.deepEqual(rewritten.payload[key].filter((m) => m.role === role),
          payload[key].filter((m) => m.role === role), 'signed assistant replay must be unchanged');
      });
    }
  }
}
