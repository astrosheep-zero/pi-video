/** Domain types. No Pi, provider SDK, network, or filesystem dependencies. */
export type VideoKind = "kimi" | "gemini";
export interface ModelIdentity {
  readonly provider: string;
  readonly id: string;
  readonly api: string;
  readonly baseUrl?: string;
  readonly headers?: Readonly<Record<string, string>>;
}
export interface VideoRoute {
  readonly kind: VideoKind;
  /** Prevent replay to another provider, API, or endpoint. Never contains credentials. */
  readonly scope: string;
  readonly maxFileBytes: number;
  readonly maxRequestBytes: number;
}
/** This is the ONLY representation permitted in tool details/session files. */
export interface VideoReference {
  readonly version: 1;
  readonly marker: string;
  readonly callId: string;
  readonly scope: string;
  readonly path: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly sha256: string;
}
/** Private, process-local representation. Never return it from a tool. */
export interface InlineVideo {
  readonly reference: VideoReference;
  readonly data: string;
}
export interface UploadedVideo {
  readonly reference: VideoReference;
  readonly url: string;
  /** Hash of the resolved endpoint and credentials, never persisted. */
  readonly uploadScope: string;
}
export type ResidentVideo = InlineVideo | UploadedVideo;
export interface VideoToolResult {
  content: {
    type: "text";
    text: string;
  }[];
  details: {
    readVideo: VideoReference;
  };
}
export interface ContextMessage {
  readonly role: string;
  readonly toolName?: string;
  readonly toolCallId?: string;
  readonly isError?: boolean;
  readonly content?: unknown;
  readonly details?: unknown;
}
export type RecordValue = Record<string, unknown>;
export const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
export interface WireResult {
  readonly payload: unknown;
  readonly videos: number;
  readonly omitted: number;
}
/** Resolve only markers authorized from genuine tool results by prepareContext for this request.
 * Wire encoders must not use the reference's original callId as a serialized protocol ID.
 */
export type ResolveVideo = (marker: string) => ResidentVideo | undefined;
