import { applyHomography, homogeneousW, invert3, multiply3, squareToQuad, type Mat3, type Quad } from './homography';
import type { Point } from './polygon';

/**
 * Artwork placement inside a surface's perspective frame.
 *
 * Surface space: s and t run 0..1 across the perspective frame. To keep the artwork's proportions
 * we work in *surface units* where the frame is `surfaceAspect` wide and 1 high.
 *
 * Placement fields:
 *  - scale: artwork height as a multiple of the frame height (1 = same height as the frame)
 *  - offsetX / offsetY: artwork centre in surface (s, t) coordinates
 *  - rotation: degrees, clockwise on the surface
 *  - repeat: tile the artwork instead of showing it once
 */
export interface Placement {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  repeat: boolean;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 6;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Affine map from surface (s, t, 1) to artwork (u, v, 1). */
export function surfaceToArtworkMatrix(placement: Placement, surfaceAspect: number, artworkAspect: number): Mat3 {
  const A = surfaceAspect;
  const theta = (placement.rotation * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const sh = placement.scale;
  const sw = placement.scale * artworkAspect;
  const cx = placement.offsetX * A;
  const cy = placement.offsetY;
  // X = s*A, Y = t; translate to centre; rotate by -theta; scale to artwork size; shift by 0.5.
  // u = ( cos*(X-cx) + sin*(Y-cy)) / sw + 0.5
  // v = (-sin*(X-cx) + cos*(Y-cy)) / sh + 0.5
  return [
    (cos * A) / sw,
    sin / sw,
    (-cos * cx - sin * cy) / sw + 0.5,
    (-sin * A) / sh,
    cos / sh,
    (sin * cx - cos * cy) / sh + 0.5,
    0,
    0,
    1,
  ];
}

export interface AreaProjection {
  /** unit square (surface) → normalized image */
  surfaceToImage: Mat3;
  /** normalized image → surface */
  imageToSurface: Mat3;
}

export function projectionForQuad(quad: Quad): AreaProjection | null {
  const surfaceToImage = squareToQuad(quad);
  if (!surfaceToImage) return null;
  const imageToSurface = invert3(surfaceToImage);
  if (!imageToSurface) return null;
  return { surfaceToImage, imageToSurface };
}

/** normalized image → artwork uv (projective). */
export function imageToArtworkMatrix(
  projection: AreaProjection,
  placement: Placement,
  surfaceAspect: number,
  artworkAspect: number,
): Mat3 {
  return multiply3(surfaceToArtworkMatrix(placement, surfaceAspect, artworkAspect), projection.imageToSurface);
}

/** Corners of the (unrepeated) artwork rectangle in normalized image coordinates. */
export function artworkCornersInImage(
  projection: AreaProjection,
  placement: Placement,
  surfaceAspect: number,
  artworkAspect: number,
): Point[] | null {
  const toArt = surfaceToArtworkMatrix(placement, surfaceAspect, artworkAspect);
  const fromArt = invert3(toArt);
  if (!fromArt) return null;
  const corners: Point[] = [];
  for (const c of [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ]) {
    const s = applyHomography(fromArt, c);
    if (!s) return null;
    if (homogeneousW(projection.surfaceToImage, s) <= 0) return null;
    const img = applyHomography(projection.surfaceToImage, s);
    if (!img) return null;
    corners.push(img);
  }
  return corners;
}

/** Maps image points into surface units (X = s * aspect, Y = t), skipping points past the horizon. */
function boundaryInSurfaceUnits(projection: AreaProjection, boundary: readonly Point[], surfaceAspect: number): Point[] {
  const out: Point[] = [];
  for (const p of boundary) {
    if (homogeneousW(projection.imageToSurface, p) <= 0) continue;
    const s = applyHomography(projection.imageToSurface, p);
    if (s && Number.isFinite(s.x) && Number.isFinite(s.y)) out.push({ x: s.x * surfaceAspect, y: s.y });
  }
  return out;
}

/**
 * Scale and centre the artwork so it fits inside (`contain`) or covers (`cover`) the print area's
 * outline, keeping the current rotation and the artwork's proportions.
 */
export function fitPlacement(
  mode: 'contain' | 'cover',
  projection: AreaProjection,
  boundary: readonly Point[],
  surfaceAspect: number,
  artworkAspect: number,
  current: Placement,
): Placement | null {
  const pts = boundaryInSurfaceUnits(projection, boundary, surfaceAspect);
  if (pts.length < 3) return null;
  const theta = (current.rotation * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  // Express the outline in the artwork's rotated frame.
  const rotated = pts.map((p) => ({ x: cos * p.x + sin * p.y, y: -sin * p.x + cos * p.y }));
  const minX = Math.min(...rotated.map((p) => p.x));
  const maxX = Math.max(...rotated.map((p) => p.x));
  const minY = Math.min(...rotated.map((p) => p.y));
  const maxY = Math.max(...rotated.map((p) => p.y));
  const w = maxX - minX;
  const h = maxY - minY;
  if (!(w > 1e-6 && h > 1e-6)) return null;
  const scale = mode === 'contain' ? Math.min(h, w / artworkAspect) : Math.max(h, w / artworkAspect);
  const rcx = (minX + maxX) / 2;
  const rcy = (minY + maxY) / 2;
  // Rotate the centre back into surface units.
  const cx = cos * rcx - sin * rcy;
  const cy = sin * rcx + cos * rcy;
  return {
    ...current,
    scale: clampScale(scale),
    offsetX: cx / surfaceAspect,
    offsetY: cy,
  };
}

/** Moves the artwork so the surface point under `from` ends up under `to` (both normalized image coords). */
export function panPlacement(projection: AreaProjection, placement: Placement, from: Point, to: Point): Placement {
  if (homogeneousW(projection.imageToSurface, from) <= 0 || homogeneousW(projection.imageToSurface, to) <= 0) return placement;
  const a = applyHomography(projection.imageToSurface, from);
  const b = applyHomography(projection.imageToSurface, to);
  if (!a || !b) return placement;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return placement;
  return {
    ...placement,
    offsetX: clampOffset(placement.offsetX + dx),
    offsetY: clampOffset(placement.offsetY + dy),
  };
}

export function clampOffset(v: number): number {
  return Math.min(3, Math.max(-2, v));
}

/** Approximate on-screen height (CSS px) of the perspective frame, used to anti-alias material patterns. */
export function frameScreenHeight(quad: Quad, displayWidth: number, displayHeight: number): number {
  const len = (a: Point, b: Point) => Math.hypot((a.x - b.x) * displayWidth, (a.y - b.y) * displayHeight);
  return Math.max(1, (len(quad[0], quad[3]) + len(quad[1], quad[2])) / 2);
}
