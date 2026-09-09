export const VIDEO_MIME: Readonly<Record<string, string>> = Object.freeze({
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".mkv": "video/x-matroska", ".avi": "video/x-msvideo", ".mpg": "video/mpeg",
  ".mpeg": "video/mpeg", ".flv": "video/x-flv", ".3gp": "video/3gpp",
});
/** Header sniffing is a container sanity check, NOT codec or duration validation. */
export function detectVideoMime(extension: string, header: Buffer): string {
  const ext = extension.toLowerCase();
  const mime = VIDEO_MIME[ext];
  if (!mime)
    throw new Error(`Unsupported video extension: ${ext || "(none)"}`);
  const ascii = (from: number, to: number): string => header.subarray(from, to).toString("ascii");
  let valid = false;
  if ([".mp4", ".mov", ".3gp"].includes(ext)) {
    const atom = ascii(4, 8);
    valid = header.length >= 12 && (atom === "ftyp" ||
      (ext === ".mov" && ["moov", "mdat", "wide", "free"].includes(atom)));
    if (atom === "ftyp" && ["avif", "avis", "heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(ascii(8, 12))) {
      valid = false;
    }
  }
  else if ([".webm", ".mkv"].includes(ext)) {
    valid = header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  }
  else if (ext === ".avi")
    valid = ascii(0, 4) === "RIFF" && ascii(8, 12) === "AVI ";
  else if ([".mpg", ".mpeg"].includes(ext)) {
    valid = header[0] === 0 && header[1] === 0 && header[2] === 1 && [0xba, 0xb3].includes(header[3] ?? -1);
  }
  else if (ext === ".flv")
    valid = ascii(0, 3) === "FLV";
  if (!valid)
    throw new Error("File header does not match a supported video container");
  return mime;
}
