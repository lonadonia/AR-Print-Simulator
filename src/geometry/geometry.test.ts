import { describe, expect, it } from 'vitest';
import { applyHomography, estimateSurfaceAspect, invert3, multiply3, orderQuadCorners, squareToQuad, validateQuad, IDENTITY, type Quad } from './homography';
import { artworkCornersInImage, fitPlacement, imageToArtworkMatrix, panPlacement, projectionForQuad, surfaceToArtworkMatrix } from './placement';
import {
  insertMidpoint,
  interiorLabelPoint,
  isSelfIntersecting,
  pointInPolygon,
  pointInRegion,
  removeVertex,
  signedArea,
  validatePolygon,
  type Point,
} from './polygon';

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

// L-shaped backsplash (concave), normalized image coords.
const L_SHAPE: Point[] = [
  { x: 0.1, y: 0.4 },
  { x: 0.9, y: 0.4 },
  { x: 0.9, y: 0.55 },
  { x: 0.4, y: 0.55 },
  { x: 0.4, y: 0.8 },
  { x: 0.1, y: 0.8 },
];

describe('polygon validation', () => {
  it('accepts a concave L-shaped outline', () => {
    expect(validatePolygon(L_SHAPE, 1.5)).toBeNull();
    expect(isSelfIntersecting(L_SHAPE)).toBe(false);
  });

  it('rejects too few points, crossed outlines, duplicates and flat shapes', () => {
    expect(validatePolygon(L_SHAPE.slice(0, 2), 1.5)).toBe('too-few-points');
    const bowtie = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.9, y: 0.1 },
      { x: 0.1, y: 0.9 },
    ];
    expect(validatePolygon(bowtie, 1)).toBe('self-intersecting');
    const dup = [{ x: 0.1, y: 0.1 }, { x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.1, y: 0.5 }];
    expect(validatePolygon(dup, 1)).toBe('duplicate-points');
    const flat = [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5001 }];
    expect(validatePolygon(flat, 1)).toBe('zero-area');
  });

  it('computes signed area and containment with cutouts', () => {
    const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    close(Math.abs(signedArea(square)), 1);
    expect(pointInPolygon({ x: 0.2, y: 0.7 }, L_SHAPE)).toBe(true);
    expect(pointInPolygon({ x: 0.7, y: 0.7 }, L_SHAPE)).toBe(false); // the notch of the L
    const stove = [{ x: 0.15, y: 0.6 }, { x: 0.3, y: 0.6 }, { x: 0.3, y: 0.75 }, { x: 0.15, y: 0.75 }];
    expect(pointInRegion({ x: 0.2, y: 0.7 }, L_SHAPE, [stove])).toBe(false);
    expect(pointInRegion({ x: 0.35, y: 0.7 }, L_SHAPE, [stove])).toBe(true);
  });

  it('adds and removes vertices without dropping below three points', () => {
    const tri = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.5, y: 0.9 }];
    const four = insertMidpoint(tri, 0);
    expect(four).toHaveLength(4);
    expect(four[1]).toEqual({ x: 0.5, y: 0.1 });
    expect(removeVertex(four, 1)).toEqual(tri);
    expect(removeVertex(tri, 0)).toBeNull();
  });

  it('places the label inside concave shapes and outside cutouts', () => {
    const p = interiorLabelPoint(L_SHAPE, [], 1.5);
    expect(pointInPolygon(p, L_SHAPE)).toBe(true);
  });
});

const ANGLED: Quad = [
  { x: 0.1, y: 0.2 },
  { x: 0.8, y: 0.3 },
  { x: 0.8, y: 0.7 },
  { x: 0.1, y: 0.85 },
];

describe('homography', () => {
  it('maps the unit square onto an angled frame exactly at the corners', () => {
    const H = squareToQuad(ANGLED)!;
    const corners = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    corners.forEach((c, i) => {
      const p = applyHomography(H, c)!;
      close(p.x, ANGLED[i].x);
      close(p.y, ANGLED[i].y);
    });
  });

  it('inverts and preserves straight lines (collinearity) through the projection', () => {
    const H = squareToQuad(ANGLED)!;
    const Hi = invert3(H)!;
    const I = multiply3(H, Hi);
    I.forEach((v, i) => close(v, IDENTITY[i], 1e-9));
    // Points along a straight surface line s = 0.3 must stay collinear in the image.
    const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => applyHomography(H, { x: 0.3, y: t })!);
    const [a, b] = [pts[0], pts[4]];
    for (const p of pts) {
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      close(cross, 0, 1e-12);
    }
    // Perspective foreshortening: the frame recedes to the right, so equal surface steps along a
    // horizontal surface line get shorter in the image towards the far edge.
    const row = [0, 0.25, 0.5, 0.75, 1].map((s) => applyHomography(H, { x: s, y: 0.5 })!);
    const d1 = Math.hypot(row[1].x - row[0].x, row[1].y - row[0].y);
    const d4 = Math.hypot(row[4].x - row[3].x, row[4].y - row[3].y);
    expect(d1 - d4).toBeGreaterThan(1e-3);
  });

  it('rejects folded or collapsed perspective frames', () => {
    expect(validateQuad(ANGLED, 1.5)).toBeNull();
    const folded: Quad = [ANGLED[0], ANGLED[2], ANGLED[1], ANGLED[3]];
    expect(validateQuad(folded, 1.5)).not.toBeNull();
    const collapsed: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.9, y: 0.1001 }, { x: 0.1, y: 0.5 }];
    expect(validateQuad(collapsed, 1)).toBe('collapsed-corner');
  });

  it('orders arbitrary corner input as TL, TR, BR, BL', () => {
    const shuffled = [ANGLED[2], ANGLED[0], ANGLED[3], ANGLED[1]];
    expect(orderQuadCorners(shuffled)).toEqual(ANGLED);
  });

  it('estimates surface proportion from edge lengths', () => {
    const rect: Quad = [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }, { x: 0, y: 0.5 }];
    close(estimateSurfaceAspect(rect, 2), 2, 1e-9); // image twice as wide as high
  });
});

describe('artwork placement', () => {
  const proj = projectionForQuad(ANGLED)!;
  const placement = { scale: 1, offsetX: 0.5, offsetY: 0.5, rotation: 0, repeat: false };

  it('maps the artwork centre to the frame centre and keeps proportions', () => {
    const M = surfaceToArtworkMatrix(placement, 2, 2); // artwork as wide (relative) as the surface
    const c = applyHomography(M, { x: 0.5, y: 0.5 })!;
    close(c.x, 0.5);
    close(c.y, 0.5);
    const tl = applyHomography(M, { x: 0, y: 0 })!;
    close(tl.x, 0);
    close(tl.y, 0);
  });

  it('composes image → artwork through the inverse homography', () => {
    const M = imageToArtworkMatrix(proj, placement, 1.4, 1.4);
    // The frame's top-left corner in the image is the artwork's top-left.
    const uv = applyHomography(M, ANGLED[0])!;
    close(uv.x, 0, 1e-9);
    close(uv.y, 0, 1e-9);
    const corners = artworkCornersInImage(proj, placement, 1.4, 1.4)!;
    corners.forEach((p, i) => {
      close(p.x, ANGLED[i].x, 1e-9);
      close(p.y, ANGLED[i].y, 1e-9);
    });
  });

  it('fits (contain) and fills (cover) the outline without changing the outline', () => {
    const boundary = [...ANGLED];
    const contain = fitPlacement('contain', proj, boundary, 2, 1, placement)!;
    const cover = fitPlacement('cover', proj, boundary, 2, 1, placement)!;
    close(contain.scale, 1, 1e-9); // limited by height
    close(cover.scale, 2, 1e-9); // limited by width (2 units wide, artwork 1:1)
    close(contain.offsetX, 0.5, 1e-9);
    close(contain.offsetY, 0.5, 1e-9);
    expect(boundary).toEqual(ANGLED);
  });

  it('pans the artwork along the surface so it follows the pointer', () => {
    const from = applyHomography(proj.surfaceToImage, { x: 0.5, y: 0.5 })!;
    const to = applyHomography(proj.surfaceToImage, { x: 0.6, y: 0.4 })!;
    const moved = panPlacement(proj, placement, from, to);
    close(moved.offsetX, 0.6, 1e-9);
    close(moved.offsetY, 0.4, 1e-9);
    expect(moved.scale).toBe(placement.scale);
  });
});
