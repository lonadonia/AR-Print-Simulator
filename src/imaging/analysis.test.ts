import { describe, expect, it } from 'vitest';
import { pointInPolygon, signedArea, validatePolygon } from '../geometry/polygon';
import { analyzeRGBA, magicCombine, magicSelect, rasterizeShape, simplifyClosed, snapPoint, traceContours } from './analysis';

type RGB = [number, number, number];

/** Synthetic photo: background, a surface (rect or L), an obstacle inside it, mild noise. */
function makeImage(w: number, h: number, paint: (x: number, y: number) => RGB, noise = 3): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      const n = rnd() * noise * 2;
      data.set([r + n, g + n, b + n, 255], (y * w + x) * 4);
    }
  return data;
}

const W = 240;
const H = 160;
const BG: RGB = [70, 90, 110];
const WALL: RGB = [228, 220, 205];
const SOCKET: RGB = [250, 250, 248];
const inRect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x < x1 && y >= y0 && y < y1;

const rectScene = makeImage(W, H, (x, y) => {
  if (inRect(x, y, 100, 60, 116, 84)) return [40, 40, 40]; // dark socket plate inside the wall
  if (inRect(x, y, 40, 30, 200, 130)) {
    const shade = (x - 40) * 0.12; // gentle lighting gradient across the wall
    return [WALL[0] - shade, WALL[1] - shade, WALL[2] - shade];
  }
  return BG;
});

describe('photo analysis', () => {
  const an = analyzeRGBA(rectScene, W, H);

  it('finds the surface corners and snaps to them', () => {
    const near = { x: 43 / W, y: 33 / H }; // a few pixels from the top-left corner (40, 30)
    const snap = snapPoint(an, near, 6);
    expect(snap?.kind).toBe('corner');
    expect(Math.abs(snap!.point.x * W - 40)).toBeLessThan(1.6);
    expect(Math.abs(snap!.point.y * H - 30)).toBeLessThan(1.6);
  });

  it('snaps to a strong edge when no corner is near', () => {
    const near = { x: 120 / W, y: 127 / H }; // just above the bottom edge (y = 130)
    const snap = snapPoint(an, near, 6, { corners: false });
    expect(snap?.kind).toBe('edge');
    expect(Math.abs(snap!.point.y * H - 130)).toBeLessThan(1.6);
  });

  it('does not snap in a flat area', () => {
    expect(snapPoint(an, { x: 150 / W, y: 100 / H }, 5)).toBeNull();
  });

  it('magic-selects the wall with the socket as a cutout and estimates its perspective frame', () => {
    const res = magicSelect(an, { x: 70 / W, y: 100 / H }, { tolerance: 40 })!;
    expect(res).not.toBeNull();
    expect(validatePolygon(res.boundary, W / H)).toBeNull();
    // Outline close to the rectangle 40..200 × 30..130.
    const xs = res.boundary.map((p) => p.x * W);
    const ys = res.boundary.map((p) => p.y * H);
    expect(Math.min(...xs)).toBeGreaterThan(37);
    expect(Math.max(...xs)).toBeLessThan(203);
    expect(Math.min(...ys)).toBeGreaterThan(27);
    expect(Math.max(...ys)).toBeLessThan(133);
    expect(res.boundary.length).toBeLessThanOrEqual(8);
    // The socket becomes a hole.
    expect(res.holes).toHaveLength(1);
    expect(pointInPolygon({ x: 108 / W, y: 72 / H }, res.holes[0])).toBe(true);
    // A rectangle is recognised as a quadrilateral surface.
    expect(res.quad).not.toBeNull();
    expect(res.coverage).toBeGreaterThan(0.3);
    expect(res.coverage).toBeLessThan(0.5);
  });

  it('handles an L-shaped surface', () => {
    const img = makeImage(W, H, (x, y) => (inRect(x, y, 30, 20, 210, 70) || inRect(x, y, 150, 70, 210, 140) ? SOCKET : BG));
    const res = magicSelect(analyzeRGBA(img, W, H), { x: 60 / W, y: 40 / H }, { tolerance: 30 })!;
    expect(res.holes).toHaveLength(0);
    expect(res.quad).toBeNull(); // not a quadrilateral
    expect(res.boundary.length).toBeGreaterThanOrEqual(6);
    expect(pointInPolygon({ x: 180 / W, y: 120 / H }, res.boundary)).toBe(true); // the leg
    expect(pointInPolygon({ x: 80 / W, y: 120 / H }, res.boundary)).toBe(false); // the notch
  });
});

describe('precise selection', () => {
  // A tiled panel: 6 × 4 light tiles with dark grout, on a darker wall.
  const TILE = 24;
  const GROUT = 3;
  const tiled = makeImage(W, H, (x, y) => {
    if (!inRect(x, y, 40, 30, 40 + 6 * TILE, 30 + 4 * TILE)) return BG;
    const gx = (x - 40) % TILE;
    const gy = (y - 30) % TILE;
    return gx < GROUT || gy < GROUT ? [120, 120, 118] : [214, 222, 226];
  });
  const anTiles = analyzeRGBA(tiled, W, H);
  const centre = { x: (40 + 2.5 * TILE) / W, y: (30 + 1.5 * TILE) / H };

  it('selects a single tile by default and the whole tiled panel across joints', () => {
    const one = magicSelect(anTiles, centre, { tolerance: 30 })!;
    expect(one.coverage).toBeLessThan(0.02);
    const all = magicSelect(anTiles, centre, { tolerance: 30, bridgeJoints: true })!;
    expect(all.coverage).toBeGreaterThan(0.3);
    expect(all.holes).toHaveLength(0); // grout lines are filled, not turned into cutouts
    expect(all.quad).not.toBeNull();
    const xs = all.boundary.map((p) => p.x * W);
    expect(Math.min(...xs)).toBeLessThan(48); // the outer grout line borders the wall, so the outline stops inside it
    expect(Math.max(...xs)).toBeGreaterThan(178);
  });

  it('does not bridge into a surface of a different colour', () => {
    const img = makeImage(W, H, (x, y) => {
      if (inRect(x, y, 118, 0, 122, H)) return [60, 60, 60]; // a thin dark line…
      return x < 120 ? WALL : [150, 170, 200]; // …between two different surfaces
    });
    const res = magicSelect(analyzeRGBA(img, W, H), { x: 0.2, y: 0.5 }, { tolerance: 40, bridgeJoints: true })!;
    expect(Math.max(...res.boundary.map((p) => p.x * W))).toBeLessThan(121);
  });

  it('starts from the calmest nearby pixel when the tap lands on a joint', () => {
    const onGrout = { x: (40 + 2 * TILE + 1) / W, y: (30 + 1.5 * TILE) / H };
    expect(magicSelect(anTiles, onGrout, { tolerance: 30 })).not.toBeNull();
  });

  it('adds to and subtracts from an outline', () => {
    const left = { boundary: [{ x: 40 / W, y: 30 / H }, { x: 120 / W, y: 30 / H }, { x: 120 / W, y: 130 / H }, { x: 40 / W, y: 130 / H }], holes: [] };
    const an2 = analyzeRGBA(rectScene, W, H);
    // Add: the wall right of the outline joins it.
    const added = magicCombine(an2, left, { x: 170 / W, y: 100 / H }, 'add', { tolerance: 40 });
    expect('result' in added).toBe(true);
    if ('result' in added) expect(Math.max(...added.result.boundary.map((p) => p.x * W))).toBeGreaterThan(195);
    // Subtract: removing the socket from inside creates a cutout.
    const whole = magicSelect(an2, { x: 70 / W, y: 100 / H }, { tolerance: 40 })!;
    const filled = { boundary: whole.boundary, holes: [] };
    const cut = magicCombine(an2, filled, { x: 108 / W, y: 72 / H }, 'subtract', { tolerance: 40 });
    expect('result' in cut && cut.result.holes.length).toBe(1);
    // A surface that does not touch the outline is refused for "add".
    const far = magicCombine(an2, { boundary: [{ x: 0.05, y: 0.05 }, { x: 0.12, y: 0.05 }, { x: 0.12, y: 0.12 }], holes: [] }, { x: 0.6, y: 0.6 }, 'add', { tolerance: 40 });
    expect(far).toEqual({ failure: 'disjoint' });
  });

  it('rasterizes an outline with a cutout (even-odd)', () => {
    const an3 = analyzeRGBA(rectScene, W, H);
    const m = rasterizeShape(an3, [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.75 }, { x: 0.25, y: 0.75 }], [
      [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.6, y: 0.6 }, { x: 0.4, y: 0.6 }],
    ]);
    const at = (x: number, y: number) => m[Math.floor(y * H) * W + Math.floor(x * W)];
    expect(at(0.3, 0.3)).toBe(1);
    expect(at(0.5, 0.5)).toBe(0);
    expect(at(0.1, 0.1)).toBe(0);
    const count = m.reduce((s, v) => s + v, 0);
    expect(Math.abs(count - W * H * (0.25 - 0.04))).toBeLessThan(W * H * 0.01);
  });
});

describe('contour tracing', () => {
  it('traces an outer loop (negative area) and a hole loop (positive area)', () => {
    const w = 8;
    const h = 8;
    const mask = new Uint8Array(w * h);
    for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) mask[y * w + x] = 1;
    for (let y = 3; y < 5; y++) for (let x = 3; x < 5; x++) mask[y * w + x] = 0;
    const loops = traceContours(mask, w, h);
    expect(loops).toHaveLength(2);
    const areas = loops.map(signedArea).sort((a, b) => a - b);
    expect(areas[0]).toBe(-36);
    expect(areas[1]).toBe(4);
  });

  it('simplifies staircase outlines', () => {
    const pts = [];
    for (let i = 0; i < 20; i++) pts.push({ x: i, y: 0 }, { x: i + 1, y: 0.4 });
    pts.push({ x: 20, y: 10 }, { x: 0, y: 10 });
    expect(simplifyClosed(pts, 1).length).toBe(4);
  });
});
