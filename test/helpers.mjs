import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { newMarker } from '../src/references.ts';
import { videoRoute } from '../src/routes.ts';

export const KIMI = Object.freeze({ provider: 'kimi-coding', id: 'kimi-for-coding', api: 'anthropic-messages', baseUrl: 'https://api.kimi.com/coding' });
export const GEMINI = Object.freeze({ provider: 'google', id: 'gemini-3-test', api: 'google-generative-ai', baseUrl: 'https://generativelanguage.googleapis.com' });
export const CONFIG = JSON.stringify({ providers: {
  'kimi-coding': { modelOverrides: { 'kimi-for-coding': { video: true } } },
  google: { models: [{ id: 'gemini-3-test', video: true }] },
} });
// Deliberately only a container-header fixture, NOT a decodable video.
export const BYTES = Buffer.from([0, 0, 0, 24, ...Buffer.from('ftypisom'), 0, 0, 0, 1, ...Buffer.from('isommp42')]);

export async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'pi-read-video-test-'));
  const cwd = join(root, 'project');
  const agentDir = join(root, 'agent');
  await mkdir(cwd); await mkdir(agentDir);
  const path = join(cwd, 'clip.mp4');
  await writeFile(path, BYTES);
  await writeFile(join(agentDir, 'models.json'), CONFIG);
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, cwd, path, agentDir };
}

export function encoded(extra = {}) {
  return { path: '/project/clip.mp4', filename: 'clip.mp4', size: BYTES.length, mimeType: 'video/mp4',
    sha256: createHash('sha256').update(BYTES).digest('hex'), data: BYTES.toString('base64'), ...extra };
}
export function inline(model = KIMI, extra = {}) {
  const video = encoded();
  const { data, ...meta } = video;
  return { data, reference: { version: 1, marker: newMarker(), callId: 'call_1', scope: videoRoute(model).scope, ...meta, ...extra } };
}
export function message(result, extra = {}) {
  return { role: 'toolResult', toolName: 'read_video', toolCallId: 'call_1', isError: false, content: result.content, details: result.details, ...extra };
}
export function kimiPayload(ref) {
  return { model: KIMI.id, system: [{ type: 'text', text: 'keep this system prompt' }], messages: [
    { role: 'assistant', content: [ { type: 'thinking', thinking: 'opaque', signature: 'unchanged' },
      { type: 'tool_use', id: ref.callId, name: 'read_video', input: { path: ref.path } } ] },
    { role: 'user', content: [ { type: 'tool_result', tool_use_id: ref.callId,
      content: [{ type: 'text', text: `metadata\n${ref.marker}\ntail`, cache_control: { type: 'ephemeral' } }] } ] },
  ] };
}
export function geminiPayload(ref, id = ref.callId) {
  return { model: GEMINI.id, config: { systemInstruction: 'keep this system prompt' }, contents: [
    { role: 'model', parts: [ { functionCall: { name: 'read_video', ...(id ? { id } : {}), args: { path: ref.path } }, thoughtSignature: 'c2ln' },
      { functionCall: { name: 'read', id: 'call_2', args: { path: 'file.ts' } } } ] },
    { role: 'user', parts: [ { functionResponse: { name: 'read_video', ...(id ? { id } : {}), response: { output: ref.marker } } },
      { functionResponse: { name: 'read', id: 'call_2', response: { output: 'hello' } } } ] },
  ] };
}
export const resolveOne = (video) => (marker) => marker === video.reference.marker ? video : undefined;
export const containsBytes = (value) => JSON.stringify(value).includes(BYTES.toString('base64'));

export function harness(model, ws) {
  const events = new Map(), tools = new Map(), notifications = [];
  let active = ['read', 'write', 'bash', 'edit', 'other_plugin'];
  const ctx = { model, cwd: ws.cwd, signal: undefined, hasUI: true,
    ui: { notify: (value) => notifications.push(value), confirm: async () => true },
    modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true, apiKey: 'offline-fixture-not-a-key' }) },
  };
  const pi = {
    on(event, handler) { const list = events.get(event) ?? []; list.push(handler); events.set(event, list); },
    registerTool(tool) { tools.set(tool.name, tool); active.push(tool.name); },
    registerCommand() { throw new Error('No slash commands'); },
    getActiveTools: () => [...active], setActiveTools: (value) => { active = [...value]; },
  };
  const options = { agentDir: ws.agentDir, parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    fetch: async () => new Response(JSON.stringify({ id: 'file-fixture' }), { status: 200 }),
    renderText: (text) => ({ text, render: () => [text], invalidate() {} }) };
  async function emit(event, value = {}) {
    let result;
    for (const handler of events.get(event) ?? []) {
      const next = await handler({ type: event, ...value }, ctx);
      if (next !== undefined) result = next;
    }
    return result;
  }
  return { pi, ctx, emit, tools, events, notifications, options, get active() { return [...active]; } };
}
