import { isRecord, type ResolveVideo, type VideoRoute, type WireResult } from "../types.ts";
import { rewriteGemini } from "./gemini.ts";
import { rewriteKimi } from "./kimi.ts";
export interface RewriteResult extends WireResult {
  readonly warning?: string;
}
/** Pure transformation. Does not read files, resolve auth, send HTTP, or mutate the session. */
export function rewriteRequest(payload: unknown, route: VideoRoute, modelId: string, resolve: ResolveVideo): RewriteResult {
  const rewrite = route.kind === "kimi" ? rewriteKimi : rewriteGemini;
  const modelMatches = isRecord(payload) && typeof payload.model === "string" && payload.model.replace(/^models\//, "") === modelId;
  const result = rewrite(payload, modelMatches ? resolve : () => undefined);
  if (result.videos === 0)
    return result;
  let size: number;
  try {
    size = Buffer.byteLength(JSON.stringify(result.payload), "utf8");
  }
  catch {
    return { ...rewrite(payload, () => undefined), warning: "Cannot measure the request size. No video was attached." };
  }
  if (size <= route.maxRequestBytes)
    return result;
  const fallback = rewrite(payload, () => undefined, "inline request exceeds the client byte budget; shorten the context or trim the video before retrying");
  return { ...fallback, warning: `Inline request exceeds the client budget (${size} > ${route.maxRequestBytes} bytes). No video was attached. Start a shorter context or trim the video. Files API fallback is disabled.` };
}
