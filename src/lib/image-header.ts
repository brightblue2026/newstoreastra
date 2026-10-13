/**
 * Pixel dimensions read straight out of an image file's header bytes.
 *
 * Why this exists: Supabase Storage is a plain object store — it reports
 * size and a content type the uploader chose, and nothing about what the
 * bytes are. `saveProductImageAction` uses a header that parses here as its
 * proof that a stored object really is an image in an accepted format.
 *
 * It was first written to enforce §9's "at least 2000px on the long edge"
 * rule against a number the client could not forge. That rule was removed on
 * 13 October 2026; any pixel size is accepted now.
 *
 * Every format here declares its dimensions within the first few hundred
 * bytes, so the caller fetches a small Range of the uploaded object rather
 * than the whole multi-megabyte file.
 *
 * Deliberately dependency-free. `image-size` would do this in one line, but
 * the working agreement says to ask before adding a dependency, and four
 * well-specified header layouts are a smaller thing to own than a package —
 * and far easier to test, which is the point.
 */

export interface Dimensions {
  width: number;
  height: number;
}

/** Bytes to read for a reliable parse — AVIF's `ispe` box is the deepest of these. */
export const HEADER_BYTES = 64 * 1024;

function u16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u32(bytes: Uint8Array, offset: number): number {
  // `>>> 0` keeps a box length with the top bit set from coming back negative.
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  );
}

function u32le(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset + 3] << 24) | (bytes[offset + 2] << 16) | (bytes[offset + 1] << 8) | bytes[offset]) >>> 0
  );
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[offset + i]);
  return out;
}

/** PNG: an 8-byte signature, then an IHDR chunk whose first 8 bytes are the size. */
function png(bytes: Uint8Array): Dimensions | null {
  if (!startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return null;
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') return null;
  return { width: u32(bytes, 16), height: u32(bytes, 20) };
}

/**
 * JPEG: walk the marker segments to the frame header (SOF0-SOF15), whose
 * payload carries height then width. SOF4, SOF8 and SOF12 are skipped because
 * they are not frame headers (DHT, JPG and DAC respectively) despite sitting
 * in the same numeric range — a detail that silently returns nonsense if
 * missed.
 */
function jpeg(bytes: Uint8Array): Dimensions | null {
  if (!startsWith(bytes, [0xff, 0xd8])) return null;

  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1; // Re-sync over padding rather than giving up.
      continue;
    }
    const marker = bytes[offset + 1];

    // Standalone markers: no length field to skip over.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // End, or start of scan data.

    const length = u16(bytes, offset + 2);
    if (length < 2) return null;

    const isFrameHeader =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isFrameHeader) {
      if (offset + 9 >= bytes.length) return null;
      return { height: u16(bytes, offset + 5), width: u16(bytes, offset + 7) };
    }

    offset += 2 + length;
  }
  return null;
}

/**
 * WebP: a RIFF container whose fourth chunk tag says which of three very
 * different layouts holds the size — lossy (`VP8 `), lossless (`VP8L`) or
 * extended (`VP8X`). All three store it minus one, and the lossless one packs
 * two 14-bit values across a little-endian 32-bit word.
 */
function webp(bytes: Uint8Array): Dimensions | null {
  if (!startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) || ascii(bytes, 8, 4) !== 'WEBP') return null;
  if (bytes.length < 30) return null;

  const chunk = ascii(bytes, 12, 4);

  if (chunk === 'VP8 ') {
    // 16-bit values, top two bits are scaling hints.
    return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const packed = u32le(bytes, 21);
    return { width: (packed & 0x3fff) + 1, height: ((packed >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    // Two 24-bit little-endian values, each stored as (size - 1).
    const width = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1;
    const height = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1;
    return { width, height };
  }
  return null;
}

function u16le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

/**
 * AVIF: an ISO base media container. The size lives in an `ispe` box nested
 * meta → iprp → ipco → ispe. Rather than walk that tree box by box, this
 * scans for the `ispe` tag directly — the payload immediately after it is two
 * big-endian 32-bit values, and a false positive would have to be four
 * matching bytes followed by a plausible size, which is not a failure mode
 * worth a hundred lines of box walking.
 *
 * A multi-image AVIF can carry several `ispe` boxes (thumbnails). The first is
 * the primary item in every file a camera or converter produces.
 */
function avif(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== 'ftyp') return null;

  const brand = ascii(bytes, 8, 4);
  if (!['avif', 'avis', 'mif1', 'msf1', 'heic', 'heix'].includes(brand)) return null;

  for (let offset = 16; offset + 12 < bytes.length; offset += 1) {
    if (ascii(bytes, offset, 4) !== 'ispe') continue;
    // 4 tag bytes, then a 4-byte version/flags word, then width and height.
    const width = u32(bytes, offset + 8);
    const height = u32(bytes, offset + 12);
    if (width > 0 && height > 0) return { width, height };
  }
  return null;
}

/**
 * Dimensions for any format the uploader accepts, or `null` when the bytes are
 * not a recognised image. `null` is a refusal, never a pass — see the caller.
 */
export function readImageDimensions(bytes: Uint8Array): Dimensions | null {
  const parsed = png(bytes) ?? jpeg(bytes) ?? webp(bytes) ?? avif(bytes);
  if (!parsed) return null;
  if (!Number.isInteger(parsed.width) || !Number.isInteger(parsed.height)) return null;
  if (parsed.width <= 0 || parsed.height <= 0) return null;
  return parsed;
}
