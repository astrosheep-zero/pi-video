import { hasMarker, markerPattern, unavailable } from "../references.ts";
import { isRecord, type RecordValue, type ResolveVideo, type WireResult } from "../types.ts";
/** Kimi's Anthropic-compatible VIDEO extension, not a Claude API video feature. */
export function rewriteKimi(payload: unknown, resolve: ResolveVideo, reason?: string): WireResult {
  if (!isRecord(payload) || !Array.isArray(payload.messages))
    return { payload, videos: 0, omitted: 0 };
  const videoCalls = new Set<string>();
  const seen = new Set<string>();
  let videos = 0;
  let omitted = 0;
  const messages = payload.messages.map((message: unknown) => {
    if (!isRecord(message) || !Array.isArray(message.content))
      return message;
    if (message.role === "assistant") {
      for (const part of message.content) {
        if (isRecord(part) && part.type === "tool_use" && part.name === "read_video" && typeof part.id === "string")
          videoCalls.add(part.id);
      }
      return message;
    }
    if (message.role !== "user")
      return message;
    const content = message.content.map((block: unknown) => {
      if (!isRecord(block) || block.type !== "tool_result" || typeof block.tool_use_id !== "string")
        return block;
      const callId = block.tool_use_id;
      const hasCall = videoCalls.delete(callId);
      const original = typeof block.content === "string" ? [{ type: "text", text: block.content }] : block.content;
      if (!Array.isArray(original))
        return block;
      let changed = false;
      const parts = original.flatMap((part: unknown) => {
        if (!isRecord(part) || part.type !== "text" || !hasMarker(part.text))
          return [part];
        changed = true;
        const output: RecordValue[] = [];
        const { text, cache_control: cache, ...attributes } = part;
        // hasMarker narrows part.text, whereas a destructured unknown retains its declared type.
        const source = part.text as string;
        let cursor = 0;
        for (const match of source.matchAll(markerPattern())) {
          if (match.index > cursor)
            output.push({ ...attributes, type: "text", text: source.slice(cursor, match.index) });
          const video = hasCall && block.is_error !== true ? resolve(match[0]) : undefined;
          // resolve authorizes the marker in context; callId is only a wire-level pairing key.
          if (!video) {
            omitted++;
            output.push({ type: "text", text: unavailable(undefined, reason) });
          }
          else {
            const key = `${video.reference.scope}|${video.reference.sha256}`;
            if (!seen.has(key)) {
              seen.add(key);
              videos++;
              output.push({ type: "video", source: "url" in video
                ? { type: "url", url: video.url }
                : { type: "base64", media_type: video.reference.mimeType, data: video.data } });
            }
            else
              output.push({ type: "text", text: "[This same video is already attached earlier in this request.]" });
          }
          cursor = match.index + match[0].length;
        }
        if (cursor < source.length)
          output.push({ ...attributes, type: "text", text: source.slice(cursor) });
        if (cache !== undefined && output.length > 0)
          output[output.length - 1]!.cache_control = cache;
        return output;
      });
      return changed ? { ...block, content: parts } : block;
    });
    return { ...message, content };
  });
  return { payload: { ...payload, messages }, videos, omitted };
}
