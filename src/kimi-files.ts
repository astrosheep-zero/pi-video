import { createHash } from "node:crypto";
import type { LoadedVideo } from "./media.ts";
import { videoRoute } from "./routes.ts";
import { isRecord, type ModelIdentity } from "./types.ts";

export interface KimiUploadContext {
  readonly scope: string;
  upload(video: LoadedVideo, signal: AbortSignal): Promise<string>;
}
export interface UploadAuth {
  readonly apiKey?: string;
  readonly headers?: Readonly<Record<string, string | null>>;
  readonly baseUrl?: string;
}
export class KimiUploadError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "KimiUploadError";
    this.status = status;
  }
}
/** Pi resolves API keys/OAuth; this module only sends the separate Files request. */
export function kimiUploadContext(model: ModelIdentity, auth: UploadAuth, fetcher: typeof fetch = globalThis.fetch): KimiUploadContext {
  const baseUrl = auth.baseUrl ?? model.baseUrl ?? "https://api.kimi.com/coding";
  if (videoRoute({ ...model, baseUrl })?.kind !== "kimi")
    throw new Error("Invalid Kimi Files endpoint");
  const base = baseUrl.replace(/\/+$/, "");
  const endpoint = `${base.endsWith("/v1") ? base : `${base}/v1`}/files`;
  const headers = new Headers({ "User-Agent": "pi-read-video", Accept: "application/json" });
  if (auth.apiKey)
    headers.set("Authorization", `Bearer ${auth.apiKey}`);
  for (const source of [model.headers, auth.headers]) {
    for (const [key, value] of Object.entries(source ?? {})) {
      if (value === null)
        headers.delete(key);
      else
        headers.set(key, value);
    }
  }
  // Let fetch choose the multipart boundary; a chat JSON content type is not reusable.
  headers.delete("content-type");
  headers.delete("content-length");
  if (!headers.get("authorization") && !headers.get("x-api-key"))
    throw new KimiUploadError("Kimi Files requires credentials from Pi; sign in or configure an API key.", 401);
  const scope = createHash("sha256").update(JSON.stringify([endpoint, [...headers].sort()])).digest("hex");
  return {
    scope,
    async upload(video, signal) {
      signal.throwIfAborted();
      const form = new FormData();
      form.set("purpose", "video");
      form.set("file", new Blob([new Uint8Array(video.bytes)], { type: video.mimeType }), video.filename);
      let response: Response;
      try {
        response = await fetcher(endpoint, { method: "POST", headers, body: form, signal, redirect: "error" });
      }
      catch {
        signal.throwIfAborted();
        throw new KimiUploadError("Kimi Files upload failed before a response was received.");
      }
      if (!response.ok) {
        await response.body?.cancel();
        // Never copy a provider error body (which may echo credentials/media) into tool history.
        throw new KimiUploadError(`Kimi Files upload failed (HTTP ${response.status}).`, response.status);
      }
      let result: unknown;
      try { result = await response.json(); }
      catch { throw new KimiUploadError("Kimi Files returned an invalid upload response."); }
      signal.throwIfAborted();
      if (!isRecord(result) || typeof result.id !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(result.id))
        throw new KimiUploadError("Kimi Files returned no valid file ID.");
      return `ms://${result.id}`;
    },
  };
}
