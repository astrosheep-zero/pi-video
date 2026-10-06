import test from 'node:test';
import assert from 'node:assert/strict';
import { kimiUploadContext, KimiUploadError } from '../src/kimi-files.ts';
import { KIMI, BYTES, encoded } from './helpers.mjs';

const { data, ...metadata } = encoded();
const video = { ...metadata, bytes: BYTES };
const signal = () => new AbortController().signal;

test('Files sends original multipart bytes, purpose=video, resolved auth and no base64', async () => {
  let calls = 0;
  const ctx = kimiUploadContext({ ...KIMI, headers: { 'x-model-header': 'retained' } }, {
    apiKey: 'fixture-key', headers: { Authorization: 'Bearer oauth-fixture', 'Content-Type': 'application/json' },
  }, async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.kimi.com/coding/v1/files');
    assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.get('Authorization'), 'Bearer oauth-fixture');
    assert.equal(options.headers.get('x-model-header'), 'retained');
    assert.equal(options.headers.has('Content-Type'), false);
    assert.equal(options.body.get('purpose'), 'video');
    const file = options.body.get('file');
    assert.equal(file.name, 'clip.mp4'); assert.equal(file.type, 'video/mp4');
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), BYTES);
    return Response.json({ id: 'file-example' });
  });
  assert.equal(await ctx.upload(video, signal()), 'ms://file-example');
  assert.equal(calls, 1); assert.ok(!ctx.scope.includes('fixture'));
});
test('Files URL normalizes /v1 and trailing slash, honors auth base URL', async () => {
  for (const baseUrl of ['https://example.test/proxy', 'https://example.test/proxy/v1', 'https://example.test/proxy/v1/']) {
    const ctx = kimiUploadContext(KIMI, { apiKey: 'fixture', baseUrl }, async (url) => {
      assert.equal(url, 'https://example.test/proxy/v1/files'); return Response.json({ id: 'file-1' });
    });
    await ctx.upload(video, signal());
  }
});
test('credential scope includes effective endpoint, model headers and current credentials', () => {
  const scope = (auth, model = KIMI) => kimiUploadContext(model, auth).scope;
  assert.equal(scope({ apiKey: 'a' }), scope({ apiKey: 'a' }));
  assert.notEqual(scope({ apiKey: 'a' }), scope({ apiKey: 'b' }));
  assert.notEqual(scope({ apiKey: 'a' }), scope({ apiKey: 'a', baseUrl: 'https://example.test/other' }));
  assert.notEqual(scope({ apiKey: 'a' }), scope({ apiKey: 'a' }, { ...KIMI, headers: { 'x-account': 'other' } }));
  assert.equal(scope({ headers: { authorization: 'Bearer a', 'x-foo': 'b' } }),
    scope({ headers: { 'x-foo': 'b', Authorization: 'Bearer a' } }));
});
test('missing auth and unsafe endpoints fail before fetch', () => {
  assert.throws(() => kimiUploadContext(KIMI, {}), (e) => e instanceof KimiUploadError && e.status === 401);
  for (const baseUrl of ['https://user:secret@example.test', 'https://example.test?key=secret', 'ftp://example.test'])
    assert.throws(() => kimiUploadContext(KIMI, { apiKey: 'fixture', baseUrl }), /endpoint/);
});
test('HTTP failure preserves status but never includes the provider body', async () => {
  for (const status of [401, 403, 404, 413, 500]) {
    const ctx = kimiUploadContext(KIMI, { apiKey: 'fixture' }, async () => new Response('echo-secret-media', { status }));
    await assert.rejects(ctx.upload(video, signal()), (error) =>
      error instanceof KimiUploadError && error.status === status && !error.message.includes('echo-secret'));
  }
});
test('invalid file IDs, malformed JSON and transport errors are sanitized', async () => {
  for (const response of [Response.json({}), Response.json({ id: 'https://example.test' }),
    Response.json({ id: 'secret\nvalue' }), Response.json({ id: 'x'.repeat(257) }), new Response('not-json')]) {
    const ctx = kimiUploadContext(KIMI, { apiKey: 'fixture' }, async () => response);
    await assert.rejects(ctx.upload(video, signal()), KimiUploadError);
  }
  const ctx = kimiUploadContext(KIMI, { apiKey: 'fixture' }, async () => { throw new Error('secret transport details'); });
  await assert.rejects(ctx.upload(video, signal()), (error) => !error.message.includes('secret'));
});
test('cancellation propagates before and during upload', async () => {
  let calls = 0;
  const before = kimiUploadContext(KIMI, { apiKey: 'fixture' }, async () => { calls++; throw new Error('unexpected'); });
  await assert.rejects(before.upload(video, AbortSignal.abort(new Error('cancelled'))), /cancelled/);
  assert.equal(calls, 0);
  const controller = new AbortController();
  const during = kimiUploadContext(KIMI, { apiKey: 'fixture' }, async (_url, options) => {
    assert.equal(options.signal, controller.signal);
    controller.abort(new Error('cancelled')); throw controller.signal.reason;
  });
  await assert.rejects(during.upload(video, controller.signal), /cancelled/);
});
