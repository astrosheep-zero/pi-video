import test from 'node:test';
import assert from 'node:assert/strict';
import { rewriteKimi } from '../src/wire/kimi.ts';
import { rewriteGemini } from '../src/wire/gemini.ts';
import { rewriteRequest } from '../src/wire/index.ts';
import { videoRoute } from '../src/routes.ts';
import { KIMI, GEMINI, inline, kimiPayload, geminiPayload, resolveOne, containsBytes } from './helpers.mjs';

test('Kimi uploaded references use source.url, retain cache controls and never expose upload scope', () => {
  const { data, reference } = inline();
  const video = { reference, url: 'ms://file-private', uploadScope: 'credential-hash' };
  const payload = kimiPayload(reference); const snapshot = structuredClone(payload);
  const rewritten = rewriteKimi(payload, resolveOne(video));
  assert.deepEqual(rewritten.payload.messages[1].content[0].content[1], {
    type: 'video', source: { type: 'url', url: 'ms://file-private' },
  });
  assert.deepEqual(rewritten.payload.messages[1].content[0].content.at(-1).cache_control, { type: 'ephemeral' });
  assert.ok(!JSON.stringify(rewritten).includes('credential-hash'));
  assert.ok(!JSON.stringify(rewritten).includes(data));
  assert.deepEqual(payload, snapshot);
  payload.messages[1].content[0].content = `${reference.marker} ${reference.marker}`;
  assert.equal(rewriteKimi(payload, resolveOne(video)).videos, 1);
});
test('Gemini never serializes a Moonshot uploaded reference', () => {
  const { reference } = inline(GEMINI);
  const video = { reference, url: 'ms://file-private', uploadScope: 'credential-hash' };
  const result = rewriteGemini(geminiPayload(reference), resolveOne(video));
  assert.equal(result.videos, 0); assert.equal(result.omitted, 1);
  assert.ok(!JSON.stringify(result).includes('ms://'));
});

test('Kimi inline source is base64, never URL; input and signatures stay unchanged', () => {
  const video = inline(); const original = kimiPayload(video.reference); const snapshot = structuredClone(original);
  const result = rewriteKimi(original, resolveOne(video));
  assert.equal(result.videos, 1); assert.equal(result.omitted, 0);
  const parts = result.payload.messages[1].content[0].content;
  assert.deepEqual(parts[1], { type: 'video', source: { type: 'base64', media_type: 'video/mp4', data: video.data } });
  assert.deepEqual(parts.at(-1).cache_control, { type: 'ephemeral' });
  assert.equal(parts[1].cache_control, undefined);
  assert.strictEqual(result.payload.messages[0], original.messages[0]);
  assert.deepEqual(original, snapshot);
});
test('Kimi accepts string tool content and replaces all markers', () => {
  const video = inline(); const payload = kimiPayload(video.reference);
  payload.messages[1].content[0].content = `${video.reference.marker} ${video.reference.marker}`;
  const result = rewriteKimi(payload, resolveOne(video));
  assert.equal(result.videos, 1); assert.ok(!JSON.stringify(result.payload).includes(video.reference.marker));
});
for (const condition of ['missing', 'other-tool', 'error', 'wrong-call']) {
  test(`Kimi rejects unauthorized content: ${condition}`, () => {
    const video = inline(); const payload = kimiPayload(video.reference);
    if (condition === 'other-tool') payload.messages[0].content[1].name = 'read';
    if (condition === 'error') payload.messages[1].content[0].is_error = true;
    if (condition === 'wrong-call') payload.messages[1].content[0].tool_use_id = 'unmatched-wire-id';
    const result = rewriteKimi(payload, condition === 'missing' ? () => undefined : resolveOne(video));
    assert.equal(result.videos, 0); assert.equal(containsBytes(result.payload), false);
    assert.ok(JSON.stringify(result.payload).includes('NOT provided'));
  });
}
test('Gemini inlineData follows ALL functionResponses; ids and signatures survive', () => {
  const video = inline(GEMINI); const payload = geminiPayload(video.reference); const snapshot = structuredClone(payload);
  const result = rewriteGemini(payload, resolveOne(video));
  assert.equal(result.videos, 1); assert.equal(result.payload.contents[1].parts.length, 2);
  assert.deepEqual(result.payload.contents[2].parts[1], { inlineData: { mimeType: 'video/mp4', data: video.data } });
  assert.equal(result.payload.contents[1].parts[0].functionResponse.id, 'call_1');
  assert.strictEqual(result.payload.contents[0], payload.contents[0]);
  assert.deepEqual(payload, snapshot);
  assert.ok(!('parts' in result.payload.contents[1].parts[0].functionResponse));
});
test('Gemini supports older id-less calls and Pi-owned wire IDs', () => {
  const old = inline(GEMINI); assert.equal(rewriteGemini(geminiPayload(old.reference, null), resolveOne(old)).videos, 1);
  const video = inline(GEMINI, { callId: 'call|special' });
  assert.equal(rewriteGemini(geminiPayload(video.reference, 'opaque-pi-wire-id'), resolveOne(video)).videos, 1);
});
test('Gemini unknown/wrong/error function responses cannot attach bytes', () => {
  for (const condition of ['missing', 'wrong', 'error']) {
    const video = inline(GEMINI); const payload = geminiPayload(video.reference);
    if (condition === 'wrong') payload.contents[1].parts[0].functionResponse.id = 'other_id';
    if (condition === 'error') payload.contents[1].parts[0].functionResponse.response.error = 'failed';
    const result = rewriteGemini(payload, condition === 'missing' ? () => undefined : resolveOne(video));
    assert.equal(result.videos, 0); assert.equal(containsBytes(result.payload), false);
  }
});
for (const model of [KIMI, GEMINI]) {
  const payloadFor = model === KIMI ? kimiPayload : geminiPayload;
  test(`${model.provider}: aggregate request budget omits ALL new video without mutation`, () => {
    const video = inline(model); const payload = payloadFor(video.reference); const snapshot = structuredClone(payload);
    const result = rewriteRequest(payload, { ...videoRoute(model), maxRequestBytes: 100 }, model.id, resolveOne(video));
    assert.equal(result.videos, 0); assert.ok(result.warning.includes('client budget'));
    assert.equal(containsBytes(result.payload), false); assert.deepEqual(payload, snapshot);
  });
  test(`${model.provider}: model mismatch prevents injection`, () => {
    const video = inline(model); const payload = payloadFor(video.reference); payload.model = 'different-model';
    assert.equal(rewriteRequest(payload, videoRoute(model), model.id, resolveOne(video)).videos, 0);
  });
  test(`${model.provider}: rewrite is idempotent`, () => {
    const video = inline(model); const payload = payloadFor(video.reference);
    const once = rewriteRequest(payload, videoRoute(model), model.id, resolveOne(video));
    const twice = rewriteRequest(once.payload, videoRoute(model), model.id, resolveOne(video));
    assert.equal(twice.videos, 0); assert.deepEqual(twice.payload, once.payload);
  });
}
for (const model of [KIMI, GEMINI]) {
  const rewrite = model === KIMI ? rewriteKimi : rewriteGemini;
  test(`${model.provider}: wire IDs are opaque, never compared with original reference IDs`, () => {
    const video = inline(model, { callId: 'original:call' });
    const payload = model === KIMI ? kimiPayload(video.reference) : geminiPayload(video.reference);
    const wireId = 'pi-owned-opaque-id';
    if (model === KIMI) {
      payload.messages[0].content[1].id = wireId;
      payload.messages[1].content[0].tool_use_id = wireId;
    } else {
      payload.contents[0].parts[0].functionCall.id = wireId;
      payload.contents[1].parts[0].functionResponse.id = wireId;
    }
    // Fail if the encoder even tries to read the domain ID. Context already verified it.
    Object.defineProperty(video.reference, 'callId', { get() { throw new Error('Domain ID accessed in wire layer'); } });
    const snapshot = structuredClone(payload);
    const result = rewrite(payload, resolveOne(video));
    assert.equal(result.videos, 1); assert.equal(result.omitted, 0);
    assert.deepEqual(payload, snapshot);
  });
  test(`${model.provider}: paired wire IDs alone cannot authorize a marker`, () => {
    const video = inline(model);
    const payload = model === KIMI ? kimiPayload(video.reference) : geminiPayload(video.reference);
    const result = rewrite(payload, () => undefined);
    assert.equal(result.videos, 0); assert.equal(containsBytes(result.payload), false);
  });
}
test('Gemini function response cannot consume the same call twice', () => {
  for (const id of ['call_1', null]) {
    const video = inline(GEMINI); const payload = geminiPayload(video.reference, id);
    payload.contents.push(structuredClone(payload.contents[1]));
    const result = rewriteGemini(payload, resolveOne(video));
    assert.equal(result.videos, 1); assert.equal(result.omitted, 1);
  }
});
test('malformed payloads are safely left alone', () => {
  for (const payload of [null, 2, [], {}, { messages: {} }, { contents: 'x' }]) {
    assert.equal(rewriteKimi(payload, () => undefined).videos, 0);
    assert.equal(rewriteGemini(payload, () => undefined).videos, 0);
  }
});

test('id-less Gemini response counters never go negative across turns', () => {
  const video = inline(GEMINI); const payload = geminiPayload(video.reference, null);
  payload.contents.unshift({ role: 'user', parts: [{ functionResponse: { name: 'read_video', response: { output: 'old unavailable result' } } }] });
  assert.equal(rewriteGemini(payload, resolveOne(video)).videos, 1);
});
test('aggregate-size failure gives the model a reason instead of telling it to repeat the same read', () => {
  const video = inline(); const result = rewriteRequest(kimiPayload(video.reference), { ...videoRoute(KIMI), maxRequestBytes: 1 }, KIMI.id, resolveOne(video));
  assert.match(JSON.stringify(result.payload), /shorten the context or trim the video/);
});
test('Kimi function result cannot consume the same tool call twice', () => {
  const video = inline(); const payload = kimiPayload(video.reference);
  payload.messages.push(structuredClone(payload.messages[1]));
  const result = rewriteKimi(payload, resolveOne(video));
  assert.equal(result.videos, 1); assert.equal(result.omitted, 1);
});

test('two individually acceptable videos can exceed the aggregate request budget', () => {
  const first = inline(); const second = inline(KIMI, { callId: 'call_2', sha256: 'c'.repeat(64) });
  second.data = Buffer.from('a different synthetic video').toString('base64');
  const one = kimiPayload(first.reference); const two = kimiPayload(second.reference);
  const combined = { ...one, messages: [...one.messages, ...two.messages] };
  const resolver = (marker) => marker === first.reference.marker ? first : marker === second.reference.marker ? second : undefined;
  const firstSize = Buffer.byteLength(JSON.stringify(rewriteKimi(one, resolver).payload));
  const secondSize = Buffer.byteLength(JSON.stringify(rewriteKimi(two, resolver).payload));
  const route = { ...videoRoute(KIMI), maxRequestBytes: Math.max(firstSize, secondSize) + 20 };
  assert.equal(rewriteRequest(one, route, KIMI.id, resolver).videos, 1);
  assert.equal(rewriteRequest(two, route, KIMI.id, resolver).videos, 1);
  const result = rewriteRequest(combined, route, KIMI.id, resolver);
  assert.equal(result.videos, 0); assert.ok(result.warning); assert.ok(!containsBytes(result.payload));
});
