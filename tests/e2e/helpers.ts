import { expect, type Page } from '@playwright/test';
import { inflateSync } from 'node:zlib';

export interface Pt {
  x: number;
  y: number;
}

/** Minimal PNG decoder (8-bit RGB/RGBA, non-interlaced) for reading screenshot pixels. */
export function decodePng(buf: Buffer): { width: number; height: number; data: Uint8Array } {
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const chunk = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      colorType = chunk[9];
      if (chunk[8] !== 8 || chunk[12] !== 0) throw new Error('Unsupported PNG');
    } else if (type === 'IDAT') idat.push(chunk);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!bpp) throw new Error(`Unsupported PNG colour type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      out[(y * width + x) * 4] = cur[x * bpp];
      out[(y * width + x) * 4 + 1] = cur[x * bpp + 1];
      out[(y * width + x) * 4 + 2] = cur[x * bpp + 2];
      out[(y * width + x) * 4 + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    prev = cur;
  }
  return { width, height, data: out };
}

export async function stageBox(page: Page) {
  const box = await page.getByTestId('stage').boundingBox();
  if (!box) throw new Error('stage not visible');
  return box;
}

export async function toScreen(page: Page, p: Pt): Promise<Pt> {
  const b = await stageBox(page);
  return { x: b.x + p.x * b.width, y: b.y + p.y * b.height };
}

/** Average rendered colour of a 3×3 CSS-pixel patch at a normalized image point. */
export async function renderedColor(page: Page, p: Pt): Promise<[number, number, number]> {
  const s = await toScreen(page, p);
  const png = decodePng(await page.screenshot({ clip: { x: Math.round(s.x) - 1, y: Math.round(s.y) - 1, width: 3, height: 3 } }));
  const acc = [0, 0, 0];
  const n = png.width * png.height;
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) acc[k] += png.data[i * 4 + k];
  return acc.map((v) => Math.round(v / n)) as [number, number, number];
}

/** Colour of the original photo file at a normalized point (reference for "unprinted" pixels). */
export async function photoColor(page: Page, url: string, p: Pt): Promise<[number, number, number]> {
  return page.evaluate(
    async ({ url, p }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(Math.round(p.x * c.width) - 2, Math.round(p.y * c.height) - 2, 5, 5).data;
      const acc = [0, 0, 0];
      for (let i = 0; i < 25; i++) for (let k = 0; k < 3; k++) acc[k] += d[i * 4 + k];
      return acc.map((v) => Math.round(v / 25)) as [number, number, number];
    },
    { url, p },
  );
}

export function colorDistance(a: number[], b: number[]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

/** Normalized image positions of the visible handles of a kind. */
export async function handlePositions(page: Page, kind: 'boundary' | 'cutout' | 'perspective'): Promise<Pt[]> {
  const b = await stageBox(page);
  const boxes = await page.locator(`.rv-handle--${kind}`).evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }),
  );
  return boxes.map((c) => ({ x: (c.x - b.x) / b.width, y: (c.y - b.y) / b.height }));
}

export async function stageShot(page: Page): Promise<Buffer> {
  return page.getByTestId('stage').screenshot();
}

export async function openEditor(page: Page) {
  await page.goto('/');
  await expect(page.locator('.rv-arealist__item')).toHaveCount(2);
  await expect(page.locator('.rv-roombtn__name')).toHaveText('Kitchen with angled backsplash');
  // Let the WebGL preview draw its first frames (photo + artwork textures).
  await page.waitForTimeout(800);
}

export const area = (page: Page, name: string) => page.locator('.rv-arealist__item', { hasText: name });
export const tab = (page: Page, name: string) => page.getByRole('tab', { name });
