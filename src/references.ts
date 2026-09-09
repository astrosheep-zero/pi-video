import { randomUUID } from "node:crypto";
import { VIDEO_MIME } from "./formats.ts";
import { isRecord, type ContextMessage, type VideoReference } from "./types.ts";
const SOURCE = String.raw `\[\[pi-read-video:v1:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\]\]`;
export const markerPattern = (): RegExp => new RegExp(SOURCE, "g");
export const newMarker = (): string => `[[pi-read-video:v1:${randomUUID()}]]`;
export const hasMarker = (text: unknown): text is string => typeof text === "string" && markerPattern().test(text);
export function isVideoReference(value: unknown): value is VideoReference {
  return isRecord(value) && value.version === 1 && typeof value.marker === "string" &&
    new RegExp(`^${SOURCE}$`).test(value.marker) && typeof value.callId === "string" &&
    typeof value.scope === "string" && typeof value.path === "string" && typeof value.filename === "string" &&
    typeof value.mimeType === "string" && Object.values(VIDEO_MIME).includes(value.mimeType) &&
    typeof value.size === "number" && Number.isSafeInteger(value.size) && value.size > 0 &&
    typeof value.sha256 === "string" && /^[a-f0-9]{64}$/.test(value.sha256);
}
export function referenceFromMessage(message: ContextMessage): VideoReference | undefined {
  if (message.role !== "toolResult" || message.toolName !== "read_video" || message.isError || !isRecord(message.details))
    return undefined;
  const ref = message.details.readVideo;
  return isVideoReference(ref) && ref.callId === message.toolCallId ? ref : undefined;
}
export function unavailable(reference?: VideoReference, reason = "inline bytes unavailable, disabled, or scoped to another provider"): string {
  return `[Video NOT provided to the current model: ${reason}.${reference ? ` Local file: ${JSON.stringify(reference.path)}.` : ""} Do not claim to have inspected this video.]`;
}
export function redactMarkers(text: string, reason: string): string {
  return text.replace(markerPattern(), () => unavailable(undefined, reason));
}
export function mapMessageText<T extends ContextMessage>(message: T, map: (text: string) => string): T {
  if (typeof message.content === "string")
    return { ...message, content: map(message.content) };
  if (!Array.isArray(message.content))
    return message;
  return { ...message, content: message.content.map((part: unknown) => isRecord(part) && part.type === "text" && typeof part.text === "string" ? { ...part, text: map(part.text) } : part) };
}
