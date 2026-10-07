import { describe, expect, it } from 'vitest';
import { readImageDimensions } from './image-header';

/** A real PNG header: signature, then an IHDR chunk carrying the size. */
function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8); // IHDR length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

/** SOI, an APP0 segment to be skipped, then an SOF0 frame header. */
function jpegBytes(width: number, height: number, marker = 0xc0): Uint8Array {
  const bytes = new Uint8Array(40);
  const view = new DataView(bytes.buffer);
  bytes.set([0xff, 0xd8], 0);

  bytes.set([0xff, 0xe0], 2); // APP0
  view.setUint16(4, 8); // length, including itself
  bytes.set([0x4a, 0x46, 0x49, 0x46, 0x00, 0x00], 6);

  const sof = 12;
  bytes.set([0xff, marker], sof);
  view.setUint16(sof + 2, 17); // segment length
  bytes[sof + 4] = 8; // precision
  view.setUint16(sof + 5, height);
  view.setUint16(sof + 7, width);
  return bytes;
}

function webpLossyBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(40);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  bytes.set([0x56, 0x50, 0x38, 0x20], 12); // "VP8 "
  bytes[26] = width & 0xff;
  bytes[27] = (width >> 8) & 0x3f;
  bytes[28] = height & 0xff;
  bytes[29] = (height >> 8) & 0x3f;
  return bytes;
}

function webpExtendedBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(40);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x58], 12); // "VP8X"
  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 0xff;
  bytes[25] = (w >> 8) & 0xff;
  bytes[26] = (w >> 16) & 0xff;
  bytes[27] = h & 0xff;
  bytes[28] = (h >> 8) & 0xff;
  bytes[29] = (h >> 16) & 0xff;
  return bytes;
}

function avifBytes(width: number, height: number, brand = 'avif'): Uint8Array {
  const bytes = new Uint8Array(80);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 32); // ftyp box length
  bytes.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
  for (let i = 0; i < 4; i += 1) bytes[8 + i] = brand.charCodeAt(i);

  const ispe = 40;
  bytes.set([0x69, 0x73, 0x70, 0x65], ispe); // "ispe"
  view.setUint32(ispe + 4, 0); // version + flags
  view.setUint32(ispe + 8, width);
  view.setUint32(ispe + 12, height);
  return bytes;
}

describe('PNG', () => {
  it('reads the size from IHDR', () => {
    expect(readImageDimensions(pngBytes(2400, 1800))).toEqual({ width: 2400, height: 1800 });
  });

  it('handles a dimension past 16 bits', () => {
    expect(readImageDimensions(pngBytes(70000, 2))).toEqual({ width: 70000, height: 2 });
  });

  it('rejects a PNG signature with no IHDR', () => {
    const broken = pngBytes(100, 100);
    broken.set([0x78, 0x78, 0x78, 0x78], 12);
    expect(readImageDimensions(broken)).toBeNull();
  });
});

describe('JPEG', () => {
  it('skips APP segments to find the frame header', () => {
    expect(readImageDimensions(jpegBytes(2400, 1800))).toEqual({ width: 2400, height: 1800 });
  });

  it('reads progressive JPEG (SOF2) too', () => {
    expect(readImageDimensions(jpegBytes(3000, 2000, 0xc2))).toEqual({ width: 3000, height: 2000 });
  });

  // 0xC4 is a Huffman table, not a frame header, despite sitting in the SOF range.
  it('does not mistake a Huffman table for a frame header', () => {
    expect(readImageDimensions(jpegBytes(2400, 1800, 0xc4))).toBeNull();
  });

  it('gives up at the start of scan data rather than reading pixels as a header', () => {
    const bytes = jpegBytes(2400, 1800);
    bytes.set([0xff, 0xda], 12); // SOS where the frame header was
    expect(readImageDimensions(bytes)).toBeNull();
  });
});

describe('WebP', () => {
  it('reads a lossy file', () => {
    expect(readImageDimensions(webpLossyBytes(2400, 1800))).toEqual({ width: 2400, height: 1800 });
  });

  it('reads an extended file, which stores size minus one', () => {
    expect(readImageDimensions(webpExtendedBytes(2400, 1800))).toEqual({ width: 2400, height: 1800 });
  });

  it('rejects RIFF that is not WEBP', () => {
    const bytes = webpLossyBytes(100, 100);
    bytes.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
    expect(readImageDimensions(bytes)).toBeNull();
  });
});

describe('AVIF', () => {
  it('finds the size in the ispe box', () => {
    expect(readImageDimensions(avifBytes(2400, 1800))).toEqual({ width: 2400, height: 1800 });
  });

  it('accepts the HEIF brands that share the layout', () => {
    expect(readImageDimensions(avifBytes(2400, 1800, 'mif1'))).toEqual({ width: 2400, height: 1800 });
  });

  it('rejects an unrelated ISO container', () => {
    expect(readImageDimensions(avifBytes(2400, 1800, 'mp42'))).toBeNull();
  });
});

describe('anything else', () => {
  it('refuses rather than guessing', () => {
    expect(readImageDimensions(new Uint8Array(0))).toBeNull();
    expect(readImageDimensions(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(readImageDimensions(new TextEncoder().encode('<svg width="3000"></svg>'))).toBeNull();
    // A PDF that someone renamed to .png.
    expect(readImageDimensions(new TextEncoder().encode('%PDF-1.7\nnot an image at all'))).toBeNull();
  });

  it('refuses a zero-sized image', () => {
    expect(readImageDimensions(pngBytes(0, 100))).toBeNull();
  });
});
