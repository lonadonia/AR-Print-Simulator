/**
 * Identifies an uploaded file by its *content* (magic bytes) and reads pixel dimensions from the
 * header, so oversized images can be rejected before the browser allocates memory to decode them.
 */

export type SniffedType = 'jpeg' | 'png' | 'webp' | 'gif' | 'heic' | 'avif' | 'svg' | 'bmp' | 'tiff' | 'unknown';

export const SUPPORTED_TYPES: readonly SniffedType[] = ['jpeg', 'png', 'webp'];

export interface HeaderInfo {
  type: SniffedType;
  width: number | null;
  height: number | null;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let s = '';
  for (let i = start; i < start + length && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

export function sniffType(bytes: Uint8Array): SniffedType {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG' && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a)
    return 'png';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  if (bytes.length >= 6 && ascii(bytes, 0, 4) === 'GIF8') return 'gif';
  if (bytes.length >= 2 && ascii(bytes, 0, 2) === 'BM') return 'bmp';
  if (bytes.length >= 4 && (ascii(bytes, 0, 4) === 'II*\u0000' || ascii(bytes, 0, 4) === 'MM\u0000*')) return 'tiff';
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'].includes(brand)) return 'heic';
  }
  // Text formats such as SVG/HTML may start with a UTF-8 byte-order mark or whitespace.
  const head = ascii(bytes, 0, Math.min(bytes.length, 512)).replace(/^\u00ef\u00bb\u00bf/, '').trimStart().toLowerCase();
  if (head.startsWith('<svg') || head.startsWith('<?xml') || head.startsWith('<!doctype') || head.startsWith('<html')) return 'svg';
  return 'unknown';
}

function u16be(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}
function u32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
}
function u16le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}
function u24le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
}

function pngSize(b: Uint8Array): [number, number] | null {
  if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return null;
  return [u32be(b, 16), u32be(b, 20)];
}

function jpegSize(b: Uint8Array): [number, number] | null {
  let o = 2;
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) {
      o++;
      continue;
    }
    let marker = b[o + 1];
    while (marker === 0xff && o + 2 < b.length) {
      o++;
      marker = b[o + 1];
    }
    // Standalone markers have no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan before a frame header
    const len = u16be(b, o + 2);
    if (len < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (o + 9 > b.length) return null;
      return [u16be(b, o + 7), u16be(b, o + 5)];
    }
    o += 2 + len;
  }
  return null;
}

function webpSize(b: Uint8Array): [number, number] | null {
  if (b.length < 30) return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8X') return [u24le(b, 24) + 1, u24le(b, 27) + 1];
  if (chunk === 'VP8 ') return [u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff];
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  return null;
}

export function readHeader(bytes: Uint8Array): HeaderInfo {
  const type = sniffType(bytes);
  let size: [number, number] | null = null;
  if (type === 'png') size = pngSize(bytes);
  else if (type === 'jpeg') size = jpegSize(bytes);
  else if (type === 'webp') size = webpSize(bytes);
  return { type, width: size ? size[0] : null, height: size ? size[1] : null };
}
