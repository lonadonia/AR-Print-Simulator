import { toMetric, type Point } from './polygon';

/**
 * Planar perspective (projective) mapping helpers.
 *
 * A print area's *perspective frame* is a quadrilateral (TL, TR, BR, BL) that follows the lines of
 * the photographed surface. A homography maps the unit square — the surface's own (s, t) coordinate
 * system — onto that frame in normalized image coordinates. The renderer evaluates the inverse per
 * pixel, which gives true perspective-correct texture placement without mesh seams.
 */

/** Row-major 3×3 matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export type Quad = [Point, Point, Point, Point];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function multiply3(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return r;
}

export function invert3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-14) return null;
  const inv = 1 / det;
  return [
    A * inv,
    -(b * i - c * h) * inv,
    (b * f - c * e) * inv,
    B * inv,
    (a * i - c * g) * inv,
    -(a * f - c * d) * inv,
    C * inv,
    -(a * h - b * g) * inv,
    (a * e - b * d) * inv,
  ];
}

/** Applies a homography; returns null for points on or behind the vanishing line. */
export function applyHomography(m: Mat3, p: Point): Point | null {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) return null;
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w };
}

/** Homogeneous w component — positive on the visible side of the plane. */
export function homogeneousW(m: Mat3, p: Point): number {
  return m[6] * p.x + m[7] * p.y + m[8];
}

/**
 * Closed-form homography mapping the unit square (0,0),(1,0),(1,1),(0,1) to `q` (Heckbert 1989).
 */
export function squareToQuad(q: Quad): Mat3 | null {
  const [p0, p1, p2, p3] = q;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  let a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number;
  if (Math.abs(sx) < 1e-12 && Math.abs(sy) < 1e-12) {
    a = p1.x - p0.x;
    b = p2.x - p1.x;
    c = p0.x;
    d = p1.y - p0.y;
    e = p2.y - p1.y;
    f = p0.y;
    g = 0;
    h = 0;
  } else {
    const dx1 = p1.x - p2.x;
    const dx2 = p3.x - p2.x;
    const dy1 = p1.y - p2.y;
    const dy2 = p3.y - p2.y;
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) < 1e-14) return null;
    g = (sx * dy2 - dx2 * sy) / den;
    h = (dx1 * sy - sx * dy1) / den;
    a = p1.x - p0.x + g * p1.x;
    b = p3.x - p0.x + h * p3.x;
    c = p0.x;
    d = p1.y - p0.y + g * p1.y;
    e = p3.y - p0.y + h * p3.y;
    f = p0.y;
  }
  const m: Mat3 = [a, b, c, d, e, f, g, h, 1];
  return m.every(Number.isFinite) ? m : null;
}

export type QuadIssue = 'not-convex' | 'too-small' | 'collapsed-corner';

const MIN_QUAD_AREA_FRACTION = 0.0005;
const MIN_CORNER_SINE = Math.sin((6 * Math.PI) / 180);

/**
 * A usable perspective frame must be a strictly convex quadrilateral with no corner angle
 * collapsing towards 0° or 180°; otherwise the projection degenerates.
 */
export function validateQuad(q: Quad, aspect: number): QuadIssue | null {
  const m = q.map((p) => toMetric(p, aspect));
  let sign = 0;
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = m[(i + 3) % 4];
    const b = m[i];
    const c = m[(i + 1) % 4];
    const ux = a.x - b.x;
    const uy = a.y - b.y;
    const vx = c.x - b.x;
    const vy = c.y - b.y;
    const cross = ux * vy - uy * vx;
    const lu = Math.hypot(ux, uy);
    const lv = Math.hypot(vx, vy);
    if (lu < 1e-6 || lv < 1e-6) return 'collapsed-corner';
    if (Math.abs(cross) / (lu * lv) < MIN_CORNER_SINE) return 'collapsed-corner';
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return 'not-convex';
    area += m[i].x * m[(i + 1) % 4].y - m[(i + 1) % 4].x * m[i].y;
  }
  if (Math.abs(area / 2) < MIN_QUAD_AREA_FRACTION * aspect) return 'too-small';
  return null;
}

export function quadIssueMessage(issue: QuadIssue): string {
  switch (issue) {
    case 'not-convex':
      return 'The perspective frame folded over. Keep the four marks in clockwise order around the surface.';
    case 'too-small':
      return 'The perspective frame is too small. Spread the four marks along the surface edges.';
    case 'collapsed-corner':
      return 'A corner of the perspective frame is almost flat. Move the marks apart.';
  }
}

/**
 * Orders four points as TL, TR, BR, BL (clockwise in image space, which has y pointing down).
 */
export function orderQuadCorners(points: readonly Point[]): Quad {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const sorted = points
    .slice(0, 4)
    .map((p) => ({ p, a: Math.atan2(p.y - cy, p.x - cx) }))
    .sort((u, v) => u.a - v.a)
    .map((o) => o.p);
  // atan2 with y down sorts clockwise on screen starting near the left. Rotate so TL (min x+y) is first.
  let start = 0;
  let best = Infinity;
  sorted.forEach((p, i) => {
    const score = p.x + p.y;
    if (score < best) {
      best = score;
      start = i;
    }
  });
  return [0, 1, 2, 3].map((k) => sorted[(start + k) % 4]) as Quad;
}

/**
 * Rough real-world width/height ratio of the surface inside a perspective frame, from the mean
 * lengths of opposite edges. An uncalibrated photo cannot give the true ratio, so the editor shows
 * this as an adjustable "surface proportion" rather than a measurement.
 */
export function estimateSurfaceAspect(q: Quad, aspect: number): number {
  const m = q.map((p) => toMetric(p, aspect));
  const len = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const w = (len(m[0], m[1]) + len(m[3], m[2])) / 2;
  const h = (len(m[0], m[3]) + len(m[1], m[2])) / 2;
  if (h < 1e-9) return 1;
  return Math.min(8, Math.max(0.125, w / h));
}

export function quadFromBounds(minX: number, minY: number, maxX: number, maxY: number): Quad {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}
