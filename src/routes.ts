import type { ModelIdentity, VideoRoute } from "./types.ts";
const MiB = 1024 ** 2;
/** These are conservative CLIENT budgets, not claims about server hard limits. */
export const INLINE_LIMITS = Object.freeze({
  kimi: { maxFileBytes: 35 * MiB, maxRequestBytes: 50000000 },
  gemini: { maxFileBytes: 14 * MiB, maxRequestBytes: 20000000 },
});
/** An API label alone is not evidence that a server supports a video extension. */
export function videoRoute(model: ModelIdentity | undefined): VideoRoute | undefined {
  if (!model)
    return undefined;
  let kind: "kimi" | "gemini";
  let defaultBase: string;
  let paths: string[];
  if (model.provider === "kimi-coding" && model.api === "anthropic-messages") {
    kind = "kimi";
    defaultBase = "https://api.kimi.com/coding";
    paths = ["/coding"];
  }
  else if (model.provider === "google" && model.api === "google-generative-ai") {
    kind = "gemini";
    defaultBase = "https://generativelanguage.googleapis.com";
    paths = ["", "/v1", "/v1beta"];
  }
  else {
    return undefined;
  }
  try {
    const endpoint = new URL(model.baseUrl ?? defaultBase);
    const expected = new URL(defaultBase);
    const path = endpoint.pathname.replace(/\/+$/, "");
    if (endpoint.protocol !== "https:" || endpoint.host !== expected.host ||
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !paths.includes(path)) {
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
