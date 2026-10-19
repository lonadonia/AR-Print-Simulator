/**
 * Polygon utilities for print-area boundaries and obstacle cutouts.
 *
 * All editable geometry is stored in *normalized image coordinates*: x and y run from 0 to 1
 * across the working photograph's width and height. That keeps saved state independent of CSS
 * pixels, device pixel ratio and editor zoom. Metric checks (area, crossing, distances) are done
 * in "aspect units" where the image is `aspect` wide and 1 high, so they are not skewed by the
 * photo's proportions.
 */

export interface Point {
  x: number;
  y: number;
}

export type PolygonIssue = 'too-few-points' | 'duplicate-points' | 'self-intersecting' | 'zero-area';

/** Smallest allowed polygon area as a fraction of the whole image area. */
export const MIN_AREA_FRACTION = 0.0002;
/** Two consecutive points closer than this (in image-height units) count as duplicates. */
export const MIN_EDGE_LENGTH = 0.002;

const EPS = 1e-12;

export function toMetric(p: Point, aspect: number): Point {
  return { x: p.x * aspect, y: p.y };
}

export function signedArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a.x, b.x) - 1e-12 <= p.x &&
    p.x <= Math.max(a.x, b.x) + 1e-12 &&
    Math.min(a.y, b.y) - 1e-12 <= p.y &&
    p.y <= Math.max(a.y, b.y) + 1e-12
  );
}

/** True when segments ab and cd share at least one point (touching counts). */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  const s1 = Math.abs(o1) < EPS ? 0 : Math.sign(o1);
  const s2 = Math.abs(o2) < EPS ? 0 : Math.sign(o2);
  const s3 = Math.abs(o3) < EPS ? 0 : Math.sign(o3);
  const s4 = Math.abs(o4) < EPS ? 0 : Math.sign(o4);
  if (s1 !== s2 && s3 !== s4) return true;
  if (s1 === 0 && onSegment(a, b, c)) return true;
  if (s2 === 0 && onSegment(a, b, d)) return true;
  if (s3 === 0 && onSegment(c, d, a)) return true;
  if (s4 === 0 && onSegment(c, d, b)) return true;
  return false;
}

/** True when any two non-adjacent edges of the closed polygon touch or cross. */
export function isSelfIntersecting(points: readonly Point[]): boolean {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Skip the edge itself and the two edges that share a vertex with it.
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const c = points[j];
      const d = points[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

/** Validates a closed polygon given in normalized image coordinates. */
export function validatePolygon(points: readonly Point[], aspect: number): PolygonIssue | null {
  if (points.length < 3) return 'too-few-points';
  const metric = points.map((p) => toMetric(p, aspect));
  for (let i = 0; i < metric.length; i++) {
    const a = metric[i];
    const b = metric[(i + 1) % metric.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < MIN_EDGE_LENGTH) return 'duplicate-points';
  }
  if (isSelfIntersecting(metric)) return 'self-intersecting';
  if (Math.abs(signedArea(metric)) < MIN_AREA_FRACTION * aspect) return 'zero-area';
  return null;
}

/** Even-odd point-in-polygon test. */
export function pointInPolygon(p: Point, points: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.y > p.y !== b.y > p.y) {
      const xAtY = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
      if (p.x < xAtY) inside = !inside;
    }
  }
  return inside;
}

/** True when `p` is inside the boundary and not inside any cutout. */
export function pointInRegion(p: Point, boundary: readonly Point[], cutouts: readonly (readonly Point[])[]): boolean {
  if (!pointInPolygon(p, boundary)) return false;
  return !cutouts.some((c) => c.length >= 3 && pointInPolygon(p, c));
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function polygonBounds(points: readonly Point[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function clampPoint(p: Point): Point {
  return { x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) };
}

/** Returns a copy with the midpoint of edge `edgeIndex` → `edgeIndex + 1` inserted after `edgeIndex`. */
export function insertMidpoint(points: readonly Point[], edgeIndex: number): Point[] {
  const a = points[edgeIndex];
  const b = points[(edgeIndex + 1) % points.length];
  const next = points.slice();
  next.splice(edgeIndex + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return next;
}

/** Removes a vertex; returns null when that would leave fewer than three points. */
export function removeVertex(points: readonly Point[], index: number): Point[] | null {
  if (points.length <= 3) return null;
  return points.filter((_, i) => i !== index);
}

export function movePoint(points: readonly Point[], index: number, to: Point): Point[] {
  const next = points.slice();
  next[index] = clampPoint(to);
  return next;
}

export function rectPolygon(cx: number, cy: number, w: number, h: number): Point[] {
  return [
    { x: cx - w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy + h / 2 },
    { x: cx - w / 2, y: cy + h / 2 },
  ].map(clampPoint);
}

/**
 * A point well inside the polygon (used for the on-photo area badge). Samples a grid over the
 * bounds and keeps the inside sample farthest from every edge; falls back to the vertex average.
 */
export function interiorLabelPoint(
  boundary: readonly Point[],
  cutouts: readonly (readonly Point[])[] = [],
  aspect = 1,
): Point {
  const b = polygonBounds(boundary);
  const steps = 14;
  let best: Point | null = null;
  let bestDist = -1;
  const edges: [Point, Point][] = [];
  const addEdges = (poly: readonly Point[]) => {
    for (let i = 0; i < poly.length; i++) edges.push([toMetric(poly[i], aspect), toMetric(poly[(i + 1) % poly.length], aspect)]);
  };
  addEdges(boundary);
  cutouts.forEach(addEdges);
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const p = { x: b.minX + ((b.maxX - b.minX) * (i + 0.5)) / (steps + 1), y: b.minY + ((b.maxY - b.minY) * (j + 0.5)) / (steps + 1) };
      if (!pointInRegion(p, boundary, cutouts)) continue;
      const m = toMetric(p, aspect);
      let d = Infinity;
      for (const [e0, e1] of edges) d = Math.min(d, distanceToSegment(m, e0, e1));
      if (d > bestDist) {
        bestDist = d;
        best = p;
      }
    }
  }
  if (best) return best;
  const sum = boundary.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / boundary.length, y: sum.y / boundary.length };
}

export function polygonIssueMessage(issue: PolygonIssue): string {
  switch (issue) {
    case 'too-few-points':
      return 'A shape needs at least three points.';
    case 'duplicate-points':
      return 'Two neighbouring points sit on top of each other. Move one apart or remove it.';
    case 'self-intersecting':
      return 'The outline crosses itself. Drag the highlighted point back so the edges do not cross.';
    case 'zero-area':
      return 'The shape is too small or flat to print. Spread the points out.';
  }
}
