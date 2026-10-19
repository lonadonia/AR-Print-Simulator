import { orderQuadCorners, validateQuad, type Quad } from '../geometry/homography';
import { signedArea, validatePolygon, type Point } from '../geometry/polygon';

/**
 * Photo analysis used for precise selection:
 *  - corner and edge snapping while placing or dragging points;
 *  - "magic" surface selection: grow a region of similar colour from a tapped point, trace its
 *    outline, turn larger holes (sockets, a hob, a mirror…) into cutouts and estimate a
 *    perspective frame when the surface is a quadrilateral.
 *
 * Everything runs locally on a downscaled copy of the working photo. The pure functions work on
 * raw RGBA arrays so they are unit-tested without a browser.
 */

export interface PhotoAnalysis {
  /** analysis grid size (pixels) */
  width: number;
  height: number;
  /** lightly smoothed CIELAB, 3 floats per pixel */
  lab: Float32Array;
  /** edge strength per pixel: colour gradient, raised on thin lines (ΔE per pixel) */
  grad: Float32Array;
  /** gradient magnitude above which a pixel counts as an edge */
  edgeThreshold: number;
  /** detected corners as [x, y, score] triples in analysis pixel units (pixel centres), best first */
  corners: Float32Array;
}

export interface SnapResult {
  point: Point;
  kind: 'corner' | 'edge';
}

export interface MagicResult {
  boundary: Point[];
  holes: Point[][];
  /** perspective frame when the selected surface is close to a quadrilateral */
  quad: Quad | null;
  /** selected fraction of the photo (0..1) */
  coverage: number;
}

// ---------------------------------------------------------------------------------------------
// Colour conversion and filtering
// ---------------------------------------------------------------------------------------------
const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

export function rgbaToLab(data: ArrayLike<number>, n: number): Float32Array {
  const lab = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = SRGB_TO_LINEAR[data[i * 4]];
    const g = SRGB_TO_LINEAR[data[i * 4 + 1]];
    const b = SRGB_TO_LINEAR[data[i * 4 + 2]];
    const fx = labF((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
    const fy = labF(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const fz = labF((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    lab[i * 3] = 116 * fy - 16;
    lab[i * 3 + 1] = 500 * (fx - fy);
    lab[i * 3 + 2] = 200 * (fy - fz);
  }
  return lab;
}

/** Separable 3×3 box blur on an interleaved multi-channel image (edges clamped). */
function boxBlur(src: Float32Array, w: number, h: number, ch: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xl = Math.max(0, x - 1);
      const xr = Math.min(w - 1, x + 1);
      for (let c = 0; c < ch; c++) {
        tmp[(y * w + x) * ch + c] = (src[(y * w + xl) * ch + c] + src[(y * w + x) * ch + c] + src[(y * w + xr) * ch + c]) / 3;
      }
    }
  }
  for (let y = 0; y < h; y++) {
    const yu = Math.max(0, y - 1);
    const yd = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < ch; c++) {
        out[(y * w + x) * ch + c] = (tmp[(yu * w + x) * ch + c] + tmp[(y * w + x) * ch + c] + tmp[(yd * w + x) * ch + c]) / 3;
      }
    }
  }
  return out;
}

/** CIELAB colour distance (CIE76 ΔE). */
function labDist(lab: Float32Array, i: number, L: number, a: number, b: number): number {
  const dL = lab[i * 3] - L;
  const da = lab[i * 3 + 1] - a;
  const db = lab[i * 3 + 2] - b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

// ---------------------------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------------------------
export function analyzeRGBA(data: ArrayLike<number>, width: number, height: number): PhotoAnalysis {
  const w = width;
  const h = height;
  const n = w * h;
  // One light blur keeps thin outlines (cabinet gaps, frames, grout) while removing pixel noise;
  // a wider blur is used only to find thin lines that differ from their surroundings.
  const lab0 = rgbaToLab(data, n);
  const lab = boxBlur(lab0, w, h, 3);
  const wide = boxBlur(boxBlur(lab, w, h, 3), w, h, 3);

  // Sobel gradients on L, a, b.
  const grad = new Float32Array(n);
  const gxL = new Float32Array(n);
  const gyL = new Float32Array(n);
  const at = (x: number, y: number, c: number) => lab[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 3 + c];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let c = 0; c < 3; c++) {
        const gx =
          (at(x + 1, y - 1, c) + 2 * at(x + 1, y, c) + at(x + 1, y + 1, c) - at(x - 1, y - 1, c) - 2 * at(x - 1, y, c) - at(x - 1, y + 1, c)) / 8;
        const gy =
          (at(x - 1, y + 1, c) + 2 * at(x, y + 1, c) + at(x + 1, y + 1, c) - at(x - 1, y - 1, c) - 2 * at(x, y - 1, c) - at(x + 1, y - 1, c)) / 8;
        if (c === 0) {
          gxL[y * w + x] = gx;
          gyL[y * w + x] = gy;
        }
        m += (c === 0 ? 1 : 0.5) * (gx * gx + gy * gy);
      }
      const i = y * w + x;
      // Thin lines have little gradient at their centre but differ from the wider average.
      const ridge = labDist(wide, i, lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]) * 0.6;
      grad[i] = Math.max(Math.sqrt(m), ridge);
    }
  }

  // Edge threshold from the gradient distribution (strong edges stand out from the 90th percentile).
  const sample: number[] = [];
  const step = Math.max(1, Math.floor(n / 20000));
  for (let i = 0; i < n; i += step) sample.push(grad[i]);
  sample.sort((p, q) => p - q);
  const p90 = sample[Math.floor(sample.length * 0.9)] ?? 0;
  const edgeThreshold = Math.max(1.6, p90 * 1.2);

  // Shi–Tomasi corner response with a 5×5 structure tensor.
  const ixx = new Float32Array(n);
  const iyy = new Float32Array(n);
  const ixy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    ixx[i] = gxL[i] * gxL[i];
    iyy[i] = gyL[i] * gyL[i];
    ixy[i] = gxL[i] * gyL[i];
  }
  const sum5 = (src: Float32Array) => {
    const tmp = new Float32Array(n);
    const out = new Float32Array(n);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) s += src[y * w + Math.min(w - 1, Math.max(0, x + k))];
        tmp[y * w + x] = s;
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
        out[y * w + x] = s;
      }
    return out;
  };
  const sxx = sum5(ixx);
  const syy = sum5(iyy);
  const sxy = sum5(ixy);
  const resp = new Float32Array(n);
  let maxResp = 0;
  for (let i = 0; i < n; i++) {
    const t = (sxx[i] + syy[i]) / 2;
    const d = Math.sqrt(((sxx[i] - syy[i]) / 2) ** 2 + sxy[i] * sxy[i]);
    const lmin = t - d;
    resp[i] = lmin;
    if (lmin > maxResp) maxResp = lmin;
  }
  const minResp = Math.max(maxResp * 0.006, 0.6);
  const found: [number, number, number][] = [];
  const R = 3;
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const v = resp[y * w + x];
      if (v < minResp) continue;
      let isMax = true;
      for (let dy = -R; dy <= R && isMax; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const o = resp[yy * w + xx];
          if (o > v || (o === v && (dy < 0 || (dy === 0 && dx < 0)))) {
            isMax = false;
            break;
          }
        }
      }
      if (!isMax) continue;
      // Sub-pixel refinement with a parabola through the neighbours.
      const l = resp[y * w + x - 1];
      const r = resp[y * w + x + 1];
      const u = resp[(y - 1) * w + x];
      const dn = resp[(y + 1) * w + x];
      const ox = l - 2 * v + r !== 0 ? (0.5 * (l - r)) / (l - 2 * v + r) : 0;
      const oy = u - 2 * v + dn !== 0 ? (0.5 * (u - dn)) / (u - 2 * v + dn) : 0;
      found.push([x + 0.5 + Math.max(-0.5, Math.min(0.5, ox)), y + 0.5 + Math.max(-0.5, Math.min(0.5, oy)), v]);
    }
  }
  found.sort((p, q) => q[2] - p[2]);
  const top = found.slice(0, 1500);
  const corners = new Float32Array(top.length * 3);
  top.forEach((c, i) => corners.set(c, i * 3));

  return { width: w, height: h, lab, grad, edgeThreshold, corners };
}

/** Browser helper: downscale a canvas and analyse it. Returns null if pixels cannot be read. */
export function analyzeCanvas(source: HTMLCanvasElement, maxEdge = 800): PhotoAnalysis | null {
  try {
    const s = Math.min(1, maxEdge / Math.max(source.width, source.height));
    const w = Math.max(8, Math.round(source.width * s));
    const h = Math.max(8, Math.round(source.height * s));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    return analyzeRGBA(ctx.getImageData(0, 0, w, h).data, w, h);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Snapping
// ---------------------------------------------------------------------------------------------
/**
 * Finds a corner (preferred) or a strong edge within `radius` analysis pixels of `p`
 * (normalized coordinates). Returns null when nothing convincing is near.
 */
export function snapPoint(an: PhotoAnalysis, p: Point, radius: number, opts: { corners?: boolean; edges?: boolean } = {}): SnapResult | null {
  const { width: w, height: h } = an;
  const ax = p.x * w;
  const ay = p.y * h;
  if (opts.corners !== false) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < an.corners.length; i += 3) {
      const d = Math.hypot(an.corners[i] - ax, an.corners[i + 1] - ay);
      if (d <= radius && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) return { point: { x: an.corners[best] / w, y: an.corners[best + 1] / h }, kind: 'corner' };
  }
  if (opts.edges !== false) {
    const r = Math.ceil(radius);
    const cx = Math.floor(ax);
    const cy = Math.floor(ay);
    let bestScore = -Infinity;
    let bx = -1;
    let by = -1;
    for (let y = cy - r; y <= cy + r; y++) {
      if (y < 1 || y >= h - 1) continue;
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 1 || x >= w - 1) continue;
        const d = Math.hypot(x + 0.5 - ax, y + 0.5 - ay);
        if (d > radius) continue;
        const g = an.grad[y * w + x];
        if (g < an.edgeThreshold) continue;
        const score = g - (d / radius) * an.edgeThreshold * 0.75;
        if (score > bestScore) {
          bestScore = score;
          bx = x;
          by = y;
        }
      }
    }
    if (bx >= 0) {
      // Refine across the edge: parabola through the gradient magnitude along x and y.
      const g = (x: number, y: number) => an.grad[y * w + x];
      const v = g(bx, by);
      const fx = g(bx - 1, by) - 2 * v + g(bx + 1, by);
      const fy = g(bx, by - 1) - 2 * v + g(bx, by + 1);
      const ox = fx < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (g(bx - 1, by) - g(bx + 1, by))) / fx)) : 0;
      const oy = fy < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (g(bx, by - 1) - g(bx, by + 1))) / fy)) : 0;
      return { point: { x: (bx + 0.5 + ox) / w, y: (by + 0.5 + oy) / h }, kind: 'edge' };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Magic selection
// ---------------------------------------------------------------------------------------------
function barrierMask(grad: Float32Array, threshold: number): Uint8Array {
  const out = new Uint8Array(grad.length);
  for (let i = 0; i < grad.length; i++) out[i] = grad[i] > threshold ? 1 : 0;
  return out;
}

function dilate(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      out[i] = mask[i] || (x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) || (y > 0 && mask[i - w]) || (y < h - 1 && mask[i + w]) ? 1 : 0;
    }
  return out;
}

function erode(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      out[i] =
        mask[i] && (x === 0 || mask[i - 1]) && (x === w - 1 || mask[i + 1]) && (y === 0 || mask[i - w]) && (y === h - 1 || mask[i + w]) ? 1 : 0;
    }
  return out;
}

/** Dilation / erosion with the 3×3 square (8-neighbourhood). */
function dilate8(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dy = -1; dy <= 1 && !v; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && mask[yy * w + xx]) {
            v = 1;
            break;
          }
        }
      out[y * w + x] = v;
    }
  return out;
}

function erode8(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 1;
      for (let dy = -1; dy <= 1 && v; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && !mask[yy * w + xx]) {
            v = 0;
            break;
          }
        }
      out[y * w + x] = v;
    }
  return out;
}

/** Keeps the 4-connected component of `mask` containing `seed`. */
function componentAt(mask: Uint8Array, w: number, h: number, seed: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  if (!mask[seed]) return out;
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  queue[tail++] = seed;
  out[seed] = 1;
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i - x) / w;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const j of nb) {
      if (j >= 0 && mask[j] && !out[j]) {
        out[j] = 1;
        queue[tail++] = j;
      }
    }
  }
  return out;
}

/**
 * Traces the boundaries of a binary mask along pixel edges. Each loop keeps the inside on its
 * left (in y-down image coordinates), so outer loops have negative shoelace area and holes
 * positive. At diagonal "saddle" vertices the sharpest left turn is taken, which keeps loops of
 * 4-connected regions separate and simple.
 */
export function traceContours(mask: Uint8Array, w: number, h: number): Point[][] {
  const W1 = w + 1;
  const out = new Map<number, number[]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = y0 * W1 + x0;
    const list = out.get(k);
    const v = y1 * W1 + x1;
    if (list) list.push(v);
    else out.set(k, [v]);
  };
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add(x + 1, y, x, y);
      if (!inside(x - 1, y)) add(x, y, x, y + 1);
      if (!inside(x, y + 1)) add(x, y + 1, x + 1, y + 1);
      if (!inside(x + 1, y)) add(x + 1, y + 1, x + 1, y);
    }
  const loops: Point[][] = [];
  const dirOf = (a: number, b: number): [number, number] => [(b % W1) - (a % W1), Math.floor(b / W1) - Math.floor(a / W1)];
  for (const [startKey, ends] of out) {
    while (ends.length) {
      const loop: Point[] = [];
      let from = startKey;
      let to = ends.shift()!;
      loop.push({ x: from % W1, y: Math.floor(from / W1) });
      let guard = 0;
      while (to !== startKey && guard++ < 4 * (w + 1) * (h + 1)) {
        loop.push({ x: to % W1, y: Math.floor(to / W1) });
        const [dx, dy] = dirOf(from, to);
        const cands = out.get(to);
        if (!cands || cands.length === 0) break;
        let pick = 0;
        if (cands.length > 1) {
          // Preference: left turn, straight, right turn.
          const order: [number, number][] = [
            [dy, -dx],
            [dx, dy],
            [-dy, dx],
          ];
          let bestRank = 99;
          cands.forEach((c, i) => {
            const d = dirOf(to, c);
            const rank = order.findIndex((o) => o[0] === d[0] && o[1] === d[1]);
            if (rank >= 0 && rank < bestRank) {
              bestRank = rank;
              pick = i;
            }
          });
        }
        from = to;
        to = cands.splice(pick, 1)[0];
      }
      if (loop.length >= 4) loops.push(removeCollinear(loop));
    }
  }
  return loops;
}

function removeCollinear(pts: Point[]): Point[] {
  const out: Point[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) !== 0) out.push(b);
  }
  return out;
}

function segDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function perpDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

function dpOpen(pts: Point[], eps: number): Point[] {
  if (pts.length < 3) return pts.slice();
  let maxD = 0;
  let idx = 0;
  const a = pts[0];
  const b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDistance(pts[i], a, b);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= eps) return [a, b];
  const left = dpOpen(pts.slice(0, idx + 1), eps);
  const right = dpOpen(pts.slice(idx), eps);
  return [...left.slice(0, -1), ...right];
}

/** Douglas–Peucker simplification of a closed polygon. */
export function simplifyClosed(pts: Point[], eps: number): Point[] {
  if (pts.length <= 4) return pts.slice();
  // Split at the vertex farthest from the first one.
  let far = 0;
  let farD = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = dpOpen(pts.slice(0, far + 1), eps);
  const b = dpOpen([...pts.slice(far), pts[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function convexHull(pts: Point[]): Point[] {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Point[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function toNormalized(pts: Point[], w: number, h: number): Point[] {
  return pts.map((p) => ({ x: Math.min(1, Math.max(0, p.x / w)), y: Math.min(1, Math.max(0, p.y / h)) }));
}

/** Simplifies a traced loop to a valid polygon with at most `maxVertices` points. */
function polygonFromLoop(loop: Point[], w: number, h: number, eps: number, maxVertices: number): Point[] | null {
  const aspect = w / h;
  let e = eps;
  for (let attempt = 0; attempt < 8; attempt++) {
    const simple = simplifyClosed(loop, e);
    if (simple.length >= 3 && simple.length <= maxVertices) {
      const norm = toNormalized(simple, w, h);
      if (!validatePolygon(norm, aspect)) return norm;
    }
    e *= 1.5;
  }
  const hull = convexHull(loop);
  const norm = toNormalized(simplifyClosed(hull, eps), w, h);
  return validatePolygon(norm, aspect) ? null : norm;
}

/**
 * Best 4-corner approximation when the region really is close to a quadrilateral. The convex
 * hull is reduced to four corners by repeatedly dropping the corner that contributes the least
 * area; the result is accepted only if the areas agree and every outline point lies close to the
 * quad's edges (so L-shapes or curved regions get no frame).
 */
function quadFromLoop(loop: Point[], w: number, h: number): Quad | null {
  const regionArea = Math.abs(signedArea(loop));
  const pts = convexHull(loop);
  if (pts.length < 4 || regionArea <= 0) return null;
  while (pts.length > 4) {
    let minA = Infinity;
    let idx = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));
      if (area < minA) {
        minA = area;
        idx = i;
      }
    }
    pts.splice(idx, 1);
  }
  const ratio = Math.abs(signedArea(pts)) / regionArea;
  if (ratio < 0.9 || ratio > 1.1) return null;
  const tol = Math.max(3, Math.sqrt(regionArea) * 0.06);
  if (loop.some((p) => Math.min(...pts.map((a, i) => segDistance(p, a, pts[(i + 1) % 4]))) > tol)) return null;
  const q = orderQuadCorners(toNormalized(pts, w, h));
  return validateQuad(q, w / h) ? null : q;
}

export interface MagicOptions {
  /** 0..100 — how different neighbouring colours may be */
  tolerance: number;
  /** maximum outline vertices */
  maxVertices?: number;
  /**
   * Continue across thin lines that have the same colour on both sides — tile grout, glass-block
   * joints, the split between cabinet doors — so a whole tiled or panelled surface is selected.
   */
  bridgeJoints?: boolean;
}

/** Longest jump across a joint line, in analysis pixels (the barrier is widened by 1 px). */
const MAX_JOINT = 12;

/** How a magic selection combines with the outline of the selected area. */
export type CombineMode = 'add' | 'subtract';

export type MagicFailure = 'nothing' | 'disjoint' | 'empty';

/** Fixed seed colour + running mean + per-step limits, all from the tolerance (0..100). */
function growthLimits(an: PhotoAnalysis, tolerance: number) {
  const t = Math.min(100, Math.max(0, tolerance)) / 100;
  return {
    // ΔE between neighbouring pixels, from the region mean and from the tapped colour.
    local: 0.6 + 2.4 * t,
    mean: 4 + 20 * t,
    seed: (4 + 20 * t) * 1.3,
    // Edges at or above this strength stop the growth.
    barrier: an.edgeThreshold * (0.3 + 0.7 * t),
  };
}

/**
 * Edge-aware region growing from `seed` (normalized). Abrupt changes (outlines, joints, frames)
 * stop the growth through the edge barrier, while gradual lighting changes across a wall are
 * allowed up to the colour limits. Returns the raw mask (before smoothing).
 */
export function growRegion(an: PhotoAnalysis, seed: Point, tolerance: number, bridgeJoints = false): { mask: Uint8Array; seedIndex: number; count: number } | null {
  const { width: w, height: h, lab, grad } = an;
  const n = w * h;
  const lim = growthLimits(an, tolerance);
  // Closing 1-px gaps in the barrier keeps the growth from leaking through breaks in faint lines.
  const wall = dilate(barrierMask(grad, lim.barrier), w, h);

  // A tap exactly on a line (e.g. a tile joint) starts from the calmest pixel nearby instead.
  let sx = Math.min(w - 1, Math.max(0, Math.floor(seed.x * w)));
  let sy = Math.min(h - 1, Math.max(0, Math.floor(seed.y * h)));
  if (wall[sy * w + sx]) {
    let best = -1;
    let bestG = Infinity;
    for (let r = 1; r <= 6 && best < 0; r++)
      for (let y = Math.max(0, sy - r); y <= Math.min(h - 1, sy + r); y++)
        for (let x = Math.max(0, sx - r); x <= Math.min(w - 1, sx + r); x++) {
          const i = y * w + x;
          if (!wall[i] && grad[i] < bestG) {
            bestG = grad[i];
            best = i;
          }
        }
    if (best >= 0) {
      sx = best % w;
      sy = (best - sx) / w;
    }
  }

  // Seed colour: mean of a 5×5 neighbourhood.
  let L = 0;
  let A = 0;
  let B = 0;
  let cnt = 0;
  for (let y = Math.max(0, sy - 2); y <= Math.min(h - 1, sy + 2); y++)
    for (let x = Math.max(0, sx - 2); x <= Math.min(w - 1, sx + 2); x++) {
      const i = y * w + x;
      if (wall[i]) continue;
      L += lab[i * 3];
      A += lab[i * 3 + 1];
      B += lab[i * 3 + 2];
      cnt++;
    }
  const s0 = sy * w + sx;
  if (!cnt) {
    L = lab[s0 * 3];
    A = lab[s0 * 3 + 1];
    B = lab[s0 * 3 + 2];
  } else {
    L /= cnt;
    A /= cnt;
    B /= cnt;
  }

  const mask = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  mask[s0] = 1;
  queue[tail++] = s0;
  let sL = lab[s0 * 3];
  let sA = lab[s0 * 3 + 1];
  let sB = lab[s0 * 3 + 2];
  // `count` includes jumped-over joint pixels; `grown` counts the pixels in the colour sums.
  let count = 1;
  let grown = 1;
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i - x) / w;
    const mL = (sL + L * 8) / (grown + 8);
    const mA = (sA + A * 8) / (grown + 8);
    const mB = (sB + B * 8) / (grown + 8);
    for (let d = 0; d < 4; d++) {
      const dx = d === 0 ? -1 : d === 1 ? 1 : 0;
      const dy = d === 2 ? -1 : d === 3 ? 1 : 0;
      if (x + dx < 0 || x + dx >= w || y + dy < 0 || y + dy >= h) continue;
      let j = i + dy * w + dx;
      let jumped = 0;
      if (mask[j]) continue;
      if (wall[j]) {
        if (!bridgeJoints) continue;
        // Jump a thin line when the far side has (almost) the colour of this side.
        let k = -1;
        let steps = 0;
        for (let st = 2; st <= MAX_JOINT; st++) {
          const xx = x + dx * st;
          const yy = y + dy * st;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) break;
          if (!wall[yy * w + xx]) {
            k = yy * w + xx;
            steps = st;
            break;
          }
        }
        if (k < 0 || mask[k]) continue;
        if (labDist(lab, k, lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]) > lim.local * 2) continue;
        j = k;
        jumped = steps;
      } else if (labDist(lab, j, lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]) > lim.local) continue;
      if (labDist(lab, j, mL, mA, mB) > lim.mean) continue;
      if (labDist(lab, j, L, A, B) > lim.seed) continue;
      for (let st = 1; st < jumped; st++) {
        const jj = i + (dy * w + dx) * st;
        if (!mask[jj]) {
          mask[jj] = 1;
          count++;
        }
      }
      mask[j] = 1;
      queue[tail++] = j;
      sL += lab[j * 3];
      sA += lab[j * 3 + 1];
      sB += lab[j * 3 + 2];
      count++;
      grown++;
    }
  }
  if (count < Math.max(30, n * 0.0002)) return null;
  return { mask, seedIndex: s0, count };
}

/**
 * Smoothing applied to grown regions: recover the band held back by the widened barrier (net
 * 2 px), close gaps up to `2 × close` px — wider when joints were bridged, so grout lines are
 * filled rather than left as slivers — and drop thin spurs.
 */
function smoothRegion(mask: Uint8Array, w: number, h: number, close = 1): Uint8Array {
  let m = mask;
  if (close > 1) {
    // Wide closing with a square element: fills joint notches flat instead of leaving V shapes.
    for (let k = 0; k < close; k++) m = dilate8(m, w, h);
    for (let k = 0; k < close; k++) m = erode8(m, w, h);
    return dilate(dilate(m, w, h), w, h);
  }
  for (let k = 0; k < close + 2; k++) m = dilate(m, w, h);
  for (let k = 0; k < close; k++) m = erode(m, w, h);
  return m;
}

/**
 * Turns a region mask into an outline polygon, obstacle holes (enclosed background larger than
 * noise) and, when the region is close to a quadrilateral, a perspective frame.
 */
export function shapeFromMask(an: PhotoAnalysis, region: Uint8Array, maxVertices = 40, eps = 1.2): MagicResult | null {
  const { width: w, height: h } = an;
  const n = w * h;
  const m = region.slice();

  // Holes: background components not connected to the border.
  const outside = new Uint8Array(n);
  {
    const q = new Int32Array(n);
    let hd = 0;
    let tl = 0;
    const push = (i: number) => {
      if (!m[i] && !outside[i]) {
        outside[i] = 1;
        q[tl++] = i;
      }
    };
    for (let x = 0; x < w; x++) {
      push(x);
      push((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      push(y * w);
      push(y * w + w - 1);
    }
    while (hd < tl) {
      const i = q[hd++];
      const x = i % w;
      const y = (i - x) / w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w);
      if (y < h - 1) push(i + w);
    }
  }
  const minHole = Math.max(24, n * 0.00035);
  const holeMasks: Uint8Array[] = [];
  const seen = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (m[i] || outside[i] || seen[i]) continue;
    const pixels: number[] = [];
    const q = [i];
    seen[i] = 1;
    while (q.length) {
      const k = q.pop()!;
      pixels.push(k);
      const x = k % w;
      const y = (k - x) / w;
      for (const j of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) {
        if (j >= 0 && !m[j] && !outside[j] && !seen[j]) {
          seen[j] = 1;
          q.push(j);
        }
      }
    }
    if (pixels.length < minHole) {
      for (const k of pixels) m[k] = 1; // fill noise
    } else {
      const comp = new Uint8Array(n);
      for (const k of pixels) comp[k] = 1;
      holeMasks.push(comp);
    }
  }

  // Outer boundary: trace the filled region (holes filled) so we get exactly one outer loop.
  const filled = new Uint8Array(n);
  for (let i = 0; i < n; i++) filled[i] = m[i] || (!outside[i] ? 1 : 0);
  const outerLoops = traceContours(filled, w, h).filter((l) => signedArea(l) < 0);
  if (!outerLoops.length) return null;
  const outer = outerLoops.reduce((a, b) => (Math.abs(signedArea(b)) > Math.abs(signedArea(a)) ? b : a));
  const boundary = polygonFromLoop(outer, w, h, eps, maxVertices);
  if (!boundary) return null;

  // Largest obstacles first.
  holeMasks.sort((a, b) => b.reduce((s, v) => s + v, 0) - a.reduce((s, v) => s + v, 0));
  const holes: Point[][] = [];
  for (const hm of holeMasks.slice(0, 16)) {
    const loops = traceContours(hm, w, h).filter((l) => signedArea(l) < 0);
    if (!loops.length) continue;
    const loop = loops.reduce((a, b) => (Math.abs(signedArea(b)) > Math.abs(signedArea(a)) ? b : a));
    const poly = polygonFromLoop(loop, w, h, 0.9, 24);
    if (poly) holes.push(poly);
  }

  let regionPixels = 0;
  for (let i = 0; i < n; i++) regionPixels += m[i];
  return { boundary, holes, quad: quadFromLoop(outer, w, h), coverage: regionPixels / n };
}

/**
 * Selects the surface around `seed` (normalized coordinates) by edge-aware region growing.
 * Returns the outline, larger enclosed obstacles as holes, and a perspective quad if applicable.
 */
export function magicSelect(an: PhotoAnalysis, seed: Point, opts: MagicOptions): MagicResult | null {
  const grown = growRegion(an, seed, opts.tolerance, opts.bridgeJoints);
  if (!grown) return null;
  const m = componentAt(smoothRegion(grown.mask, an.width, an.height, opts.bridgeJoints ? 6 : 1), an.width, an.height, grown.seedIndex);
  // Bridged joints leave small notches where they meet the outline; simplify a little more.
  return shapeFromMask(an, m, opts.maxVertices, opts.bridgeJoints ? 2.2 : 1.2);
}

/** Rasterizes an outline with its cutouts (even-odd) onto the analysis grid. */
export function rasterizeShape(an: PhotoAnalysis, boundary: readonly Point[], holes: readonly (readonly Point[])[]): Uint8Array {
  const { width: w, height: h } = an;
  const out = new Uint8Array(w * h);
  const rings = [boundary, ...holes].filter((r) => r.length >= 3).map((r) => r.map((p) => ({ x: p.x * w, y: p.y * h })));
  const xs: number[] = [];
  for (let y = 0; y < h; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (const r of rings) {
      for (let i = 0; i < r.length; i++) {
        const a = r[i];
        const b = r[(i + 1) % r.length];
        if (a.y <= cy !== b.y <= cy) xs.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] - 0.5));
      const x1 = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = x0; x <= x1; x++) out[y * w + x] = 1;
    }
  }
  return out;
}

/**
 * Adds the surface at `seed` to an existing outline, or subtracts it (subtracting inside the
 * outline creates a cutout). The combined shape is re-traced from the analysis grid.
 */
export function magicCombine(
  an: PhotoAnalysis,
  base: { boundary: readonly Point[]; holes: readonly (readonly Point[])[] },
  seed: Point,
  mode: CombineMode,
  opts: MagicOptions,
): { result: MagicResult } | { failure: MagicFailure } {
  const { width: w, height: h } = an;
  const n = w * h;
  const grown = growRegion(an, seed, opts.tolerance, opts.bridgeJoints);
  if (!grown) return { failure: 'nothing' };
  const baseMask = rasterizeShape(an, base.boundary, base.holes);
  let baseCount = 0;
  for (let i = 0; i < n; i++) baseCount += baseMask[i];
  const region = smoothRegion(grown.mask, w, h, opts.bridgeJoints ? 6 : 1);
  const combined = new Uint8Array(n);
  if (mode === 'add') {
    for (let i = 0; i < n; i++) combined[i] = baseMask[i] || region[i] ? 1 : 0;
    // Bridge hairline gaps between the old outline and the new part.
    const closed = erode(dilate(dilate(combined, w, h), w, h), w, h);
    const comp = componentAt(closed, w, h, grown.seedIndex);
    let kept = 0;
    for (let i = 0; i < n; i++) if (baseMask[i] && comp[i]) kept++;
    if (kept < baseCount * 0.6) return { failure: 'disjoint' };
    const res = shapeFromMask(an, comp, opts.maxVertices, opts.bridgeJoints ? 2.2 : 1.2);
    return res ? { result: res } : { failure: 'empty' };
  }
  for (let i = 0; i < n; i++) combined[i] = baseMask[i] && !region[i] ? 1 : 0;
  // Open (erode, then dilate) to drop thin slivers left along the removed part's border, then keep
  // the largest remaining piece.
  const opened = dilate(dilate(erode(erode(combined, w, h), w, h), w, h), w, h);
  for (let i = 0; i < n; i++) combined[i] = opened[i] && baseMask[i] ? 1 : 0;
  let best: Uint8Array | null = null;
  let bestCount = 0;
  const seen = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!combined[i] || seen[i]) continue;
    const comp = componentAt(combined, w, h, i);
    let c = 0;
    for (let k = 0; k < n; k++)
      if (comp[k]) {
        seen[k] = 1;
        c++;
      }
    if (c > bestCount) {
      bestCount = c;
      best = comp;
    }
  }
  if (!best || bestCount < Math.max(30, n * 0.0002)) return { failure: 'empty' };
  const res = shapeFromMask(an, best, opts.maxVertices, opts.bridgeJoints ? 2.2 : 1.2);
  return res ? { result: res } : { failure: 'empty' };
}
