import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, symlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectVideo, encodeVideo, cleanVideoPath } from '../src/media.ts';
import { detectVideoMime } from '../src/formats.ts';
import { VideoStore } from '../src/store.ts';
import { workspace, BYTES, encoded } from './helpers.mjs';

test('file is read once into matching hash/base64 and durable metadata', async (t) => {
  const ws = await workspace(t);
  const inspected = await inspectVideo('@clip.mp4', ws.cwd, 1024);
  const video = await encodeVideo(inspected);
  assert.equal(video.data, BYTES.toString('base64'));
  assert.equal(video.size, BYTES.length); assert.equal(video.mimeType, 'video/mp4');
  assert.equal(video.sha256, encoded().sha256);
});
test('path supports quoted @ paths and rejects empty/NUL/URL', () => {
  assert.equal(cleanVideoPath('@"a b.mp4"'), 'a b.mp4');
  assert.equal(cleanVideoPath('"@clip.mp4"'), 'clip.mp4');
  for (const value of ['', '@', '\0bad.mp4', 'https://example.test/clip.mp4']) assert.throws(() => cleanVideoPath(value));
});
test('external symlinks resolve to the real file before bounded reading', async (t) => {
  const ws = await workspace(t);
  const outside = join(ws.root, 'secret.mp4'); await writeFile(outside, BYTES);
  await symlink(outside, join(ws.cwd, 'alias.mp4'));
  const inspected = await inspectVideo('alias.mp4', ws.cwd, 1024);
  assert.equal(inspected.filename, 'secret.mp4');
  assert.equal((await encodeVideo(inspected)).data, BYTES.toString('base64'));
});
test('empty, directory, unsupported extension and oversized files fail early', async (t) => {
  const ws = await workspace(t);
  await assert.rejects(inspectVideo(ws.path, ws.cwd, 1), /inline client limit/);
  await writeFile(join(ws.cwd, 'empty.mp4'), '');
  await assert.rejects(inspectVideo('empty.mp4', ws.cwd, 1024), /empty/);
  await mkdir(join(ws.cwd, 'dir.mp4'));
  await assert.rejects(inspectVideo('dir.mp4', ws.cwd, 1024), /regular/);
  await writeFile(join(ws.cwd, 'clip.txt'), BYTES);
  await assert.rejects(inspectVideo('clip.txt', ws.cwd, 1024), /extension/);
});
test('file replacement between inspection and encoding is rejected', async (t) => {
  const ws = await workspace(t); const inspected = await inspectVideo(ws.path, ws.cwd, 1024);
  await writeFile(ws.path, Buffer.concat([BYTES, Buffer.from('changed')]));
  await assert.rejects(encodeVideo(inspected), /changed/);
});
test('abort prevents inspection and encoding', async (t) => {
  const ws = await workspace(t); const signal = AbortSignal.abort(new Error('cancelled'));
  await assert.rejects(inspectVideo(ws.path, ws.cwd, 1024, signal), /cancelled/);
  const inspected = await inspectVideo(ws.path, ws.cwd, 1024);
  await assert.rejects(encodeVideo(inspected, signal), /cancelled/);
});
for (const [extension, bytes, mime] of [
  ['.mp4', BYTES, 'video/mp4'], ['.mov', BYTES, 'video/quicktime'], ['.3gp', BYTES, 'video/3gpp'],
  ['.webm', Buffer.from([0x1a,0x45,0xdf,0xa3]), 'video/webm'], ['.mkv', Buffer.from([0x1a,0x45,0xdf,0xa3]), 'video/x-matroska'],
  ['.avi', Buffer.from('RIFFxxxxAVI '), 'video/x-msvideo'], ['.mpeg', Buffer.from([0,0,1,0xba]), 'video/mpeg'],
  ['.mpg', Buffer.from([0,0,1,0xb3]), 'video/mpeg'], ['.flv', Buffer.from('FLV'), 'video/x-flv']
]) test(`container sniff ${extension}`, () => assert.equal(detectVideoMime(extension, bytes), mime));
test('renamed text or AVIF is not accepted as video', () => {
  assert.throws(() => detectVideoMime('.mp4', Buffer.from('not a video')));
  const avif = Buffer.from(BYTES); avif.write('avif', 8);
  assert.throws(() => detectVideoMime('.mp4', avif));
});
test('store retains only metadata in references and deduplicates content', () => {
  const store = new VideoStore(1000);
  const ref = store.put(encoded(), 'scope', 'call_1');
  const second = store.put(encoded(), 'scope', 'call_2');
  assert.notEqual(ref.marker, second.marker); assert.equal(store.bytes, encoded().data.length);
  assert.ok(!('data' in ref)); assert.ok(Object.isFrozen(ref));
  assert.equal(store.get(ref.marker, 'other'), undefined);
  store.remove(ref.marker); assert.equal(store.bytes, encoded().data.length);
  store.remove(second.marker); assert.equal(store.bytes, 0);
});
test('LRU eviction enforces memory and reference limits', () => {
  const store = new VideoStore(encoded().data.length * 2, 2);
  const a = store.put(encoded(), 'scope', 'a');
  const b = store.put(encoded({ sha256: 'a'.repeat(64) }), 'scope', 'b');
  store.get(a.marker, 'scope');
  store.put(encoded({ sha256: 'b'.repeat(64) }), 'scope', 'c');
  assert.equal(store.get(b.marker, 'scope'), undefined);
  assert.ok(store.get(a.marker, 'scope')); assert.equal(store.size, 2);
  store.clear(); assert.equal(store.bytes, 0); assert.equal(store.size, 0);
});
test('store rejects impossible memory limits and oversized blob', () => {
  assert.throws(() => new VideoStore(0));
  assert.throws(() => new VideoStore(2).put(encoded(), 'scope', 'a'), /memory budget/);
});
