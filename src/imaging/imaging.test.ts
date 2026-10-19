import { describe, expect, it } from 'vitest';
import { readHeader, sniffType } from './imageHeader';
import { ImageLoadError, precheck, workingSize } from './loadImage';

function bytes(...parts: (number[] | string)[]): Uint8Array {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === 'string') for (const ch of p) out.push(ch.charCodeAt(0));
    else out.push(...p);
  }
  return new Uint8Array(out);
}

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];

function png(width: number, height: number): Uint8Array {
  return bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a], be32(13), 'IHDR', be32(width), be32(height), [8, 6, 0, 0, 0]);
}

function jpeg(width: number, height: number): Uint8Array {
  // SOI, an APP0 segment, then a baseline SOF0 frame header.
  return bytes([0xff, 0xd8], [0xff, 0xe0], be16(16), 'JFIF', [0, 1, 1, 0, 0, 1, 0, 1, 0, 0], [0xff, 0xc0], be16(17), [8], be16(height), be16(width), [3]);
}

describe('content sniffing', () => {
  it('recognises supported formats by magic bytes', () => {
    expect(sniffType(png(10, 10))).toBe('png');
    expect(sniffType(jpeg(10, 10))).toBe('jpeg');
    expect(sniffType(bytes('RIFF', [0, 0, 0, 0], 'WEBP'))).toBe('webp');
  });

  it('flags active or unsupported content regardless of file name', () => {
    expect(sniffType(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBe('svg');
    expect(sniffType(bytes([0xef, 0xbb, 0xbf], '  <?xml version="1.0"?><svg/>'))).toBe('svg');
    expect(sniffType(bytes('<!DOCTYPE html><html>'))).toBe('svg');
    expect(sniffType(bytes([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0]))).toBe('heic');
    expect(sniffType(bytes('GIF89a'))).toBe('gif');
    expect(sniffType(bytes('hello world'))).toBe('unknown');
  });

  it('reads dimensions from PNG, JPEG and WebP headers', () => {
    expect(readHeader(png(4000, 3000))).toEqual({ type: 'png', width: 4000, height: 3000 });
    expect(readHeader(jpeg(6000, 4000))).toEqual({ type: 'jpeg', width: 6000, height: 4000 });
    const vp8x = bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8X', [10, 0, 0, 0], [0, 0, 0, 0], [0x7f, 0x07, 0x00], [0x37, 0x04, 0x00]);
    expect(readHeader(vp8x)).toEqual({ type: 'webp', width: 1920, height: 1080 });
  });
});

describe('upload precheck', () => {
  const expectCode = (fn: () => unknown, code: string) => {
    try {
      fn();
    } catch (e) {
      expect(e).toBeInstanceOf(ImageLoadError);
      expect((e as ImageLoadError).code).toBe(code);
      return;
    }
    throw new Error('expected an error');
  };

  it('rejects empty, oversized and disguised files with clear codes', () => {
    expectCode(() => precheck(0, png(10, 10)), 'empty-file');
    expectCode(() => precheck(26 * 1024 * 1024, png(1000, 1000)), 'too-large-file');
    expectCode(() => precheck(1000, bytes('<svg onload="alert(1)">')), 'active-content');
    expectCode(() => precheck(1000, bytes([0, 0, 0, 24], 'ftypheic', [0, 0, 0, 0])), 'heic');
    expectCode(() => precheck(1000, bytes('not an image')), 'unsupported-type');
  });

  it('rejects images with too many or too few pixels before decoding', () => {
    expectCode(() => precheck(5_000_000, png(10000, 8000)), 'too-many-pixels');
    expectCode(() => precheck(5_000, png(120, 90)), 'too-small');
    expect(precheck(5_000_000, png(4032, 3024))).toEqual({ width: 4032, height: 3024 });
  });

  it('computes a bounded working size that keeps the aspect ratio', () => {
    expect(workingSize(4032, 3024, 'room')).toEqual({ width: 2560, height: 1920 });
    expect(workingSize(3024, 4032, 'artwork')).toEqual({ width: 1536, height: 2048 });
    expect(workingSize(800, 600, 'room')).toEqual({ width: 800, height: 600 });
    expect(workingSize(4032, 3024, 'room', 2048)).toEqual({ width: 2048, height: 1536 });
  });
});
