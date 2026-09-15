import test from 'node:test';
import assert from 'node:assert/strict';
import { VideoPolicy, loadVideoPolicy } from '../src/config.ts';
import { parseJsonc } from '../src/jsonc.ts';
import { videoRoute, INLINE_LIMITS } from '../src/routes.ts';
import { KIMI, GEMINI, workspace } from './helpers.mjs';

test('JSONC handles BOM, comments, URLs, trailing commas and escaped strings', () => {
  const text = '\ufeff{ // comment\n "url": "https://x/y/*ok*/", "escaped": "a\\\"b", /* block */ "a": [1,2,], }';
  assert.deepEqual(parseJsonc(text), { url: 'https://x/y/*ok*/', escaped: 'a"b', a: [1,2] });
});
for (const text of ['{"x": /*', '{"x":"bad}', '{"x":undefined}', '{"x":true false}']) {
  test(`JSONC rejects invalid input ${JSON.stringify(text)}`, () => assert.throws(() => parseJsonc(text)));
}
test('unconfigured models default to disabled', () => {
  const policy = VideoPolicy.parse('{}');
  assert.equal(policy.enabled(KIMI), false); assert.equal(policy.enabled(undefined), false);
});
test('model override > model definition, including explicit false', () => {
  const raw = { providers: { google: { models: [{ id: GEMINI.id, video: false }], modelOverrides: { [GEMINI.id]: { video: true } } } } };
  assert.equal(VideoPolicy.parse(JSON.stringify(raw)).enabled(GEMINI), true);
  delete raw.providers.google.modelOverrides;
  assert.equal(VideoPolicy.parse(JSON.stringify(raw)).enabled(GEMINI), false);
  delete raw.providers.google.models;
  assert.equal(VideoPolicy.parse(JSON.stringify(raw)).enabled(GEMINI), false);
});
test('provider-level video is rejected', () => {
  assert.throws(() => VideoPolicy.parse(JSON.stringify({ providers: { google: { video: true } } })), /model or modelOverride/);
});
for (const flag of ['true', 1, null, [], {}]) {
  test(`model video rejects non-boolean ${JSON.stringify(flag)}`, () => {
    for (const provider of [{ models: [{ id: 'x', video: flag }] }, { modelOverrides: { x: { video: flag } } }]) {
      assert.throws(() => VideoPolicy.parse(JSON.stringify({ providers: { google: provider } })));
    }
  });
}
test('bad model/override/provider structure fails closed', () => {
  for (const value of [[], null, { providers: [] }, { providers: { google: 42 } }, { providers: { google: { models: {} } } },
    { providers: { google: { modelOverrides: [] } } }, { providers: { google: { models: [{}] } } }]) {
    assert.throws(() => VideoPolicy.parse(JSON.stringify(value)));
  }
});
test('policy drops unrelated settings and secrets', () => {
  const policy = VideoPolicy.parse(`{"providers":{"google":{"apiKey":"secret-do-not-store","models":[{"id":"${GEMINI.id}","video":true}]}}}`);
  assert.equal(policy.enabled(GEMINI), true);
  assert.ok(!JSON.stringify(policy).includes('secret-do-not-store'));
});
test('missing models.json means disabled', async (t) => {
  const ws = await workspace(t);
  assert.equal((await loadVideoPolicy(`${ws.agentDir}/missing.json`)).enabled(KIMI), false);
});
test('routes select implemented API formats regardless of provider name', () => {
  assert.equal(videoRoute(KIMI).kind, 'kimi'); assert.equal(videoRoute(GEMINI).kind, 'gemini');
  assert.equal(videoRoute({ ...KIMI, provider: 'custom-proxy' }).kind, 'kimi');
  assert.equal(videoRoute({ ...GEMINI, provider: 'packy' }).kind, 'gemini');
  assert.equal(videoRoute({ ...GEMINI, api: 'google-vertex' }), undefined);
  assert.equal(videoRoute(undefined), undefined);
});
for (const baseUrl of ['https://u:p@api.kimi.com/coding', 'ftp://api.kimi.com/coding',
  'https://api.kimi.com/coding?token=x', 'https://api.kimi.com/coding#fragment', 'not a url']) {
  test(`reject unsafe or unsupported endpoint ${baseUrl}`, () => assert.equal(videoRoute({ ...KIMI, baseUrl }), undefined));
}
test('custom hosts, ports and paths are accepted for both encoders', () => {
  for (const model of [KIMI, GEMINI]) {
    for (const baseUrl of ['http://localhost:8080/custom/v1', 'https://www.packyapi.com/proxy/v1beta', 'https://api.kimi.com:444/other']) {
      const route = videoRoute({ ...model, provider: 'custom', baseUrl });
      assert.equal(route.kind, videoRoute(model).kind);
      assert.equal(route.scope, `custom|${model.api}|${baseUrl}`);
    }
  }
});
test('Google API paths and trailing slashes normalize safely', () => {
  assert.equal(videoRoute({ ...KIMI, baseUrl: `${KIMI.baseUrl}/` }).scope, videoRoute(KIMI).scope);
  for (const suffix of ['', '/', '/v1', '/v1beta/']) assert.equal(videoRoute({ ...GEMINI, baseUrl: `${GEMINI.baseUrl}${suffix}` }).kind, 'gemini');
});
test('raw file budgets account for base64 overhead', () => {
  for (const value of Object.values(INLINE_LIMITS)) assert.ok(4 * Math.ceil(value.maxFileBytes / 3) < value.maxRequestBytes);
});
