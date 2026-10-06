import type { ModelIdentity, VideoRoute } from "./types.ts";
const MiB = 1024 ** 2;
export const KIMI_UPLOAD_MAX_BYTES = 100 * MiB;
/** These are conservative CLIENT budgets, not claims about server hard limits. */
export const INLINE_LIMITS = Object.freeze({
  kimi: { maxFileBytes: 35 * MiB, maxRequestBytes: 50000000 },
  gemini: { maxFileBytes: 14 * MiB, maxRequestBytes: 20000000 },
});
/** Explicit video policy opts in; API format selects the wire encoder, not provider identity. */
export function videoRoute(model: ModelIdentity | undefined): VideoRoute | undefined {
  if (!model)
    return undefined;
  let kind: "kimi" | "gemini";
  let defaultBase: string;
  if (model.api === "anthropic-messages") {
    kind = "kimi";
    defaultBase = "https://api.kimi.com/coding";
  }
  else if (model.api === "google-generative-ai") {
    kind = "gemini";
    defaultBase = "https://generativelanguage.googleapis.com";
  }
  else {
    return undefined;
  }
  try {
    const endpoint = new URL(model.baseUrl ?? defaultBase);
    const path = endpoint.pathname.replace(/\/+$/, "");
    if (!["https:", "http:"].includes(endpoint.protocol) ||
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      return undefined;
    }
    return {
      kind,
      scope: `${model.provider}|${model.api}|${endpoint.origin}${path}`,
      ...INLINE_LIMITS[kind],
    };
  }
  catch {
    return undefined;
  }
}
export function modelKey(model: ModelIdentity | undefined): string {
  return model ? JSON.stringify([model.provider, model.id, model.api, model.baseUrl ?? ""]) : "";
}
