import { createHash } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, resolve } from "node:path";
import { KIMI_VIDEO_MIME, VIDEO_MIME, detectVideoMime } from "./formats.ts";
export interface InspectedVideo {
  readonly path: string;
  readonly filename: string;
  readonly snapshot: Stats;
}
export interface EncodedVideo {
  readonly path: string;
  readonly filename: string;
  readonly size: number;
  readonly mimeType: string;
  readonly sha256: string;
  readonly data: string;
}
export interface LoadedVideo extends Omit<EncodedVideo, "data"> {
  readonly bytes: Buffer;
}
export function cleanVideoPath(raw: string): string {
  if (typeof raw !== "string" || !raw.trim() || raw.includes("\0")) {
    throw new Error("A local video path is required");
  }
  const unquote = (s: string): string => s.length > 1 && ['"', "'", "`"].includes(s[0] ?? "") && s.at(-1) === s[0] ? s.slice(1, -1) : s;
  let path = unquote(raw.trim());
  if (path.startsWith("@"))
    path = path.slice(1);
  path = unquote(path);
  if (!path || /^[a-z][a-z\d+.-]*:\/\//i.test(path)) {
    throw new Error("Use a local video path, not a URL");
  }
  if (process.platform !== "win32")
    path = path.replace(/\\ /g, " ");
  return path === "~" ? homedir() : path.replace(/^~[/\\]/, `${homedir()}/`);
}
export function isVideoPath(path: string): boolean {
  try {
    return KIMI_VIDEO_MIME[extname(cleanVideoPath(path)).toLowerCase()] !== undefined;
  }
  catch {
    return false;
  }
}
export async function inspectVideo(raw: string, cwd: string, maxBytes: number, signal?: AbortSignal, uploadFormats = false): Promise<InspectedVideo> {
  signal?.throwIfAborted();
  const path = await realpath(resolve(cwd, cleanVideoPath(raw)));
  const snapshot = await stat(path);
  if (!snapshot.isFile())
    throw new Error("Video path must be a regular file");
  if (snapshot.size === 0)
    throw new Error("Video file is empty");
  if (snapshot.size > maxBytes)
    throw new Error(`Video exceeds the client file limit: ${snapshot.size} > ${maxBytes} bytes. Trim or compress it before retrying.`);
  if (!(uploadFormats ? KIMI_VIDEO_MIME : VIDEO_MIME)[extname(path).toLowerCase()])
    throw new Error("Unsupported video extension");
  signal?.throwIfAborted();
  return { path, filename: basename(path), snapshot };
}
function unchanged(a: Stats, b: Stats): boolean {
  return b.isFile() && a.dev === b.dev && a.ino === b.ino && a.size === b.size &&
    a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}
/** One bounded read through one descriptor; hash and base64 refer to the SAME bytes. */
export async function loadVideo(video: InspectedVideo, signal?: AbortSignal, uploadFormats = false): Promise<LoadedVideo> {
  signal?.throwIfAborted();
  const flags = constants.O_RDONLY | (process.platform === "win32" ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK);
  const file = await open(video.path, flags);
  try {
    if (!unchanged(video.snapshot, await file.stat()))
      throw new Error("Video changed before reading; call read_video again");
    const bytes = Buffer.alloc(video.snapshot.size);
    let position = 0;
    while (position < bytes.length) {
      signal?.throwIfAborted();
      const { bytesRead } = await file.read(bytes, position, Math.min(65536, bytes.length - position), position);
      if (bytesRead === 0)
        throw new Error("Video was truncated while reading");
      position += bytesRead;
    }
    if (!unchanged(video.snapshot, await file.stat()))
      throw new Error("Video changed while reading; call read_video again");
    signal?.throwIfAborted();
    const mimeType = detectVideoMime(extname(video.path), bytes.subarray(0, 4096), uploadFormats);
    return { path: video.path, filename: video.filename, size: bytes.length, mimeType,
      sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
  }
  finally {
    await file.close();
  }
}
export async function encodeVideo(video: InspectedVideo, signal?: AbortSignal): Promise<EncodedVideo> {
  const { bytes, ...metadata } = await loadVideo(video, signal);
  return { ...metadata, data: bytes.toString("base64") };
}
