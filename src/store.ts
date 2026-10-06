import { newMarker } from "./references.ts";
import type { EncodedVideo } from "./media.ts";
import type { ResidentVideo, VideoReference } from "./types.ts";
type VideoSource = { readonly data: string } | { readonly url: string; readonly uploadScope: string };
export type PreparedVideo = Omit<EncodedVideo, "data"> & VideoSource;
interface BlobEntry {
  source: VideoSource;
  bytes: number;
  references: number;
}
interface StoredEntry {
  reference: VideoReference;
  blobKey: string;
}
/** Bounded, content-deduplicated memory. Neither bytes nor remote handles are persisted. */
export class VideoStore {
  private readonly references = new Map<string, StoredEntry>();
  private readonly blobs = new Map<string, BlobEntry>();
  private byteCount = 0;
  readonly maxBytes: number;
  readonly maxReferences: number;
  constructor(maxBytes = 96 * 1024 ** 2, maxReferences = 256) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !Number.isSafeInteger(maxReferences) || maxReferences <= 0) {
      throw new Error("Memory store limits must be positive integers");
    }
    this.maxBytes = maxBytes;
    this.maxReferences = maxReferences;
  }
  get bytes(): number { return this.byteCount; }
  get size(): number { return this.references.size; }
  put(video: PreparedVideo, scope: string, callId: string): VideoReference {
    const source: VideoSource = "data" in video ? { data: video.data } : { url: video.url, uploadScope: video.uploadScope };
    const bytes = "data" in source ? source.data.length : source.url.length + source.uploadScope.length;
    if (bytes > this.maxBytes)
      throw new Error("Encoded video exceeds the process-local memory budget");
    const blobKey = `${scope}\0${video.sha256}\0${"url" in source ? source.uploadScope + "\0" + source.url : "inline"}`;
    while (this.references.size >= this.maxReferences ||
      this.byteCount + (this.blobs.has(blobKey) ? 0 : bytes) > this.maxBytes) {
      const oldest = this.references.keys().next().value;
      if (!oldest)
        throw new Error("Cannot reserve memory for video");
      this.remove(oldest);
    }
    let blob = this.blobs.get(blobKey);
    if (!blob) {
      blob = { source, bytes, references: 0 };
      this.blobs.set(blobKey, blob);
      this.byteCount += blob.bytes;
    }
    blob.references++;
    const reference: VideoReference = Object.freeze({ version: 1, marker: newMarker(), callId, scope,
      path: video.path, filename: video.filename, mimeType: video.mimeType, size: video.size, sha256: video.sha256 });
    this.references.set(reference.marker, { reference, blobKey });
    return reference;
  }
  get(marker: string, scope: string): ResidentVideo | undefined {
    const entry = this.references.get(marker);
    if (!entry || entry.reference.scope !== scope)
      return undefined;
    const blob = this.blobs.get(entry.blobKey);
    if (!blob)
      return undefined;
    this.references.delete(marker);
    this.references.set(marker, entry);
    return { reference: entry.reference, ...blob.source };
  }
  findUpload(scope: string, sha256: string, uploadScope: string): string | undefined {
    for (const entry of this.references.values()) {
      if (entry.reference.scope !== scope || entry.reference.sha256 !== sha256)
        continue;
      const source = this.blobs.get(entry.blobKey)?.source;
      if (source && "url" in source && source.uploadScope === uploadScope)
        return source.url;
    }
    return undefined;
  }
  remove(marker: string): void {
    const entry = this.references.get(marker);
    if (!entry)
      return;
    this.references.delete(marker);
    const blob = this.blobs.get(entry.blobKey);
    if (blob && --blob.references === 0) {
      this.byteCount -= blob.bytes;
      this.blobs.delete(entry.blobKey);
    }
  }
  clear(): void {
    this.references.clear();
    this.blobs.clear();
    this.byteCount = 0;
  }
}
