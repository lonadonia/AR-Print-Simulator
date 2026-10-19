#!/usr/bin/env node
/**
 * Generates the bundled DEMO content: three illustrated sample rooms and eight artworks.
 *
 * Everything here is drawn from code (simple 3D boxes projected through a pinhole camera, plus
 * SVG patterns), so the assets are original and free to use. They are development placeholders,
 * NOT the client's photographs or catalogue, and are labelled as demo content in the UI.
 *
 * Because the rooms come from a known 3D model, the script also writes exact preset print areas
 * (outline, cutouts and perspective frame) to src/catalog/demoGeometry.json.
 *
 * Usage: npm run assets:demo   (needs the Playwright Chromium build; see README)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'demo');
const W = 1600;
const H = 1067;

// ---------------------------------------------------------------------------------------------
// Minimal 3D → 2D projection
// ---------------------------------------------------------------------------------------------
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const r1 = (n) => Math.round(n * 10) / 10;

function camera({ pos, yaw, pitch, focal }) {
  const y = (yaw * Math.PI) / 180;
  const p = (pitch * Math.PI) / 180;
  const fwd = [Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
  const right = norm([Math.cos(y), 0, Math.sin(y)]);
  const up = cross(right, fwd);
  return {
    pos,
    depthOf(P) {
      return dot(sub(P, pos), fwd);
    },
    project(P) {
      const d = sub(P, pos);
      const z = dot(d, fwd);
      return { x: W / 2 + (focal * dot(d, right)) / z, y: H / 2 - (focal * dot(d, up)) / z, depth: z };
    },
  };
}

class Scene {
  constructor(cam) {
    this.cam = cam;
    this.layers = [[], [], []]; // 0 room shell, 1 on-wall details, 2 sorted objects
    this.defs = [];
  }
  pts(points) {
    return points.map((P) => this.cam.project(P));
  }
  /** Sutherland–Hodgman clip of a closed polygon against the camera's near plane. */
  clipNear(points, near = 0.08) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const da = this.cam.depthOf(a) - near;
      const db = this.cam.depthOf(b) - near;
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      }
    }
    return out;
  }
  path(points) {
    const clipped = this.clipNear(points);
    if (clipped.length < 3) return 'M0,0Z';
    return 'M' + this.pts(clipped).map((p) => `${r1(p.x)},${r1(p.y)}`).join('L') + 'Z';
  }
  line(points) {
    let pts = points;
    if (points.length === 2) {
      const near = 0.08;
      const [a, b] = points;
      const da = this.cam.depthOf(a) - near;
      const db = this.cam.depthOf(b) - near;
      if (da < 0 && db < 0) return 'M0,0';
      const lerp = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      if (da < 0) pts = [lerp(da / (da - db)), b];
      else if (db < 0) pts = [a, lerp(da / (da - db))];
    }
    return 'M' + this.pts(pts).map((p) => `${r1(p.x)},${r1(p.y)}`).join('L');
  }
  depth(points) {
    return points.reduce((s, P) => s + this.cam.project(P).depth, 0) / points.length;
  }
  poly(layer, points, attrs, depthBias = 0) {
    this.layers[layer].push({ d: this.depth(points) + depthBias, svg: `<path d="${this.path(points)}" ${attrs}/>` });
  }
  raw(layer, depth, svg) {
    this.layers[layer].push({ d: depth, svg });
  }
  /** Axis-aligned box with simple directional shading and back-face culling. */
  box(x0, x1, y0, y1, z0, z1, base, opts = {}) {
    const light = norm([-0.45, 0.75, 0.55]);
    const faces = [
      { n: [0, 0, 1], p: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], k: 'front' },
      { n: [0, 1, 0], p: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], k: 'top' },
      { n: [0, -1, 0], p: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], k: 'bottom' },
      { n: [1, 0, 0], p: [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], k: 'right' },
      { n: [-1, 0, 0], p: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], k: 'left' },
    ];
    for (const f of faces) {
      const c = f.p.reduce((s, P) => [s[0] + P[0] / 4, s[1] + P[1] / 4, s[2] + P[2] / 4], [0, 0, 0]);
      if (dot(f.n, sub(this.cam.pos, c)) <= 0) continue;
      const shade = 0.62 + 0.38 * Math.max(0, dot(f.n, light));
      const color = (opts[f.k] ?? base);
      this.poly(2, f.p, `fill="${shadeColor(color, shade * (opts.tone ?? 1))}" stroke="rgba(30,25,20,.22)" stroke-width="1"`, opts.bias ?? 0);
    }
  }
  svg(extraDefs = '') {
    const body = this.layers
      .map((layer, i) => (i === 2 ? layer.sort((a, b) => b.d - a.d) : layer).map((o) => o.svg).join('\n'))
      .join('\n');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>
    <feColorMatrix type="saturate" values="0"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.06"/></feComponentTransfer>
  </filter>
  <filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>
  <filter id="softer"><feGaussianBlur stdDeviation="40"/></filter>
  <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
    <stop offset="60%" stop-color="#000" stop-opacity="0"/>
    <stop offset="100%" stop-color="#000" stop-opacity="0.28"/>
  </radialGradient>
  ${this.defs.join('\n')}
  ${extraDefs}
</defs>
${body}
<rect width="${W}" height="${H}" filter="url(#grain)"/>
<rect width="${W}" height="${H}" fill="url(#vignette)"/>
</svg>`;
  }
}

function shadeColor(hex, k) {
  const v = parseInt(hex.slice(1), 16);
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => Math.max(0, Math.min(255, Math.round(x * k))));
  return `rgb(${c.join(',')})`;
}

/** Projects 3D points to normalized image coordinates for preset geometry. */
function norm2(scene, points) {
  return scene.pts(points).map((p) => ({ x: +(p.x / W).toFixed(5), y: +(p.y / H).toFixed(5) }));
}

function wallGradient(scene, id, fromP, toP, stops) {
  const a = scene.cam.project(fromP);
  const b = scene.cam.project(toP);
  scene.defs.push(
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${r1(a.x)}" y1="${r1(a.y)}" x2="${r1(b.x)}" y2="${r1(b.y)}">${stops
      .map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`)
      .join('')}</linearGradient>`,
  );
}

// ---------------------------------------------------------------------------------------------
// Scene 1 — Kitchen backsplash (angled wall, corner with a side wall)
// ---------------------------------------------------------------------------------------------
function kitchen() {
  const s = new Scene(camera({ pos: [1.25, 1.5, 3.55], yaw: 24, pitch: -6, focal: 1180 }));
  const WALL_X1 = 4.4;
  const CEIL = 2.7;
  // shell
  wallGradient(s, 'kBack', [0, 2, 0], [WALL_X1, 2, 0], [[0, '#efe9df'], [0.6, '#e4ddd2'], [1, '#d3cbbe']]);
  wallGradient(s, 'kSide', [WALL_X1, 2, 0], [WALL_X1, 2, 2.6], [[0, '#cfc6b8'], [1, '#bdb3a4']]);
  wallGradient(s, 'kFloor', [2, 0, 0], [2, 0, 2.8], [[0, '#8d7660'], [1, '#6f5a47']]);
  s.poly(0, [[0, 0, 0], [WALL_X1, 0, 0], [WALL_X1, CEIL, 0], [0, CEIL, 0]], 'fill="url(#kBack)"');
  s.poly(0, [[WALL_X1, 0, 0], [WALL_X1, 0, 2.8], [WALL_X1, CEIL, 2.8], [WALL_X1, CEIL, 0]], 'fill="url(#kSide)"');
  s.poly(0, [[-1, 0, 0], [WALL_X1, 0, 0], [WALL_X1, 0, 2.9], [-1, 0, 2.9]], 'fill="url(#kFloor)"');
  s.poly(0, [[-1, CEIL, 0], [WALL_X1, CEIL, 0], [WALL_X1, CEIL, 2.9], [-1, CEIL, 2.9]], 'fill="#f4f1ec"');
  // floor boards
  for (let x = -1; x < WALL_X1; x += 0.22) s.raw(0, 99, `<path d="${s.line([[x, 0.001, 0], [x, 0.001, 2.9]])}" stroke="rgba(40,25,10,.18)" stroke-width="1.4" fill="none"/>`);

  // soft window light on the back wall (left) and shadow under upper cabinets
  const glow = s.path([[0.6, 0.95, 0], [2.4, 0.95, 0], [2.4, 2.4, 0], [0.6, 2.4, 0]]);
  s.raw(1, 0, `<path d="${glow}" fill="#fffaf0" opacity=".35" filter="url(#softer)"/>`);

  const BACK_Y0 = 0.92; // counter top
  const BACK_Y1 = 1.5; // underside of upper cabinets
  const HOOD_Y = 1.66;
  const STOVE_X0 = 1.95;
  const STOVE_X1 = 2.71;
  const FRIDGE_X1 = 0.78;
  const UPPER_R_X0 = 2.86;
  for (const [x0, x1] of [[FRIDGE_X1, STOVE_X0 - 0.12], [UPPER_R_X0, WALL_X1]]) {
    s.raw(1, 0, `<path d="${s.path([[x0, BACK_Y1 - 0.16, 0], [x1, BACK_Y1 - 0.16, 0], [x1, BACK_Y1, 0], [x0, BACK_Y1, 0]])}" fill="#3a2c1e" opacity=".22" filter="url(#soft)"/>`);
  }
  // outlets on the backsplash
  const outlets = [
    [1.18, 1.12],
    [3.55, 1.12],
  ];
  const outletPolys = [];
  for (const [ox, oy] of outlets) {
    const p = [[ox - 0.045, oy - 0.07, 0], [ox + 0.045, oy - 0.07, 0], [ox + 0.045, oy + 0.07, 0], [ox - 0.045, oy + 0.07, 0]];
    s.poly(1, p, 'fill="#f7f5f0" stroke="#a49c8f" stroke-width="1.2"');
    s.raw(1, 0, `<path d="${s.line([[ox - 0.012, oy + 0.02, 0.001], [ox - 0.012, oy + 0.04, 0.001]])}" stroke="#5c564d" stroke-width="2"/>`);
    s.raw(1, 0, `<path d="${s.line([[ox + 0.012, oy + 0.02, 0.001], [ox + 0.012, oy + 0.04, 0.001]])}" stroke="#5c564d" stroke-width="2"/>`);
    const m = 0.012;
    outletPolys.push(norm2(s, [[ox - 0.045 - m, oy + 0.07 + m, 0], [ox + 0.045 + m, oy + 0.07 + m, 0], [ox + 0.045 + m, oy - 0.07 - m, 0], [ox - 0.045 - m, oy - 0.07 - m, 0]]));
  }

  // tall fridge / pantry column on the left
  s.box(0, FRIDGE_X1, 0, 2.3, 0, 0.66, '#cfd2d4', { front: '#d8dbdd' });
  s.raw(2, s.depth([[0.7, 1.3, 0.67]]) - 0.01, `<path d="${s.line([[0.68, 0.95, 0.661], [0.68, 1.75, 0.661]])}" stroke="#7d8286" stroke-width="5" stroke-linecap="round"/>`);
  s.box(0, FRIDGE_X1, 2.3, CEIL, 0, 0.66, '#e8e4dd');

  // base cabinets + counter
  s.box(FRIDGE_X1, WALL_X1, 0.1, 0.88, 0, 0.6, '#2f4a46', { front: '#35524d', tone: 1 });
  s.box(FRIDGE_X1, WALL_X1, 0, 0.1, 0.05, 0.56, '#1e2a28');
  s.box(FRIDGE_X1, WALL_X1, 0.88, BACK_Y0, 0, 0.64, '#e9e6e1', { front: '#d9d5cf', top: '#f2f0ec' });
  // base door seams + handles
  for (let x = FRIDGE_X1 + 0.6; x < WALL_X1 - 0.05; x += 0.6) {
    if (x > STOVE_X0 - 0.05 && x < STOVE_X1 + 0.05) continue;
    s.raw(2, s.depth([[x, 0.5, 0.6]]) - 0.5, `<path d="${s.line([[x, 0.12, 0.601], [x, 0.86, 0.601]])}" stroke="rgba(10,20,18,.55)" stroke-width="1.5"/>`);
  }
  for (let x = FRIDGE_X1 + 0.3; x < WALL_X1; x += 0.6) {
    if (x > STOVE_X0 - 0.1 && x < STOVE_X1 + 0.1) continue;
    s.raw(2, s.depth([[x, 0.8, 0.6]]) - 0.5, `<path d="${s.line([[x - 0.09, 0.8, 0.605], [x + 0.09, 0.8, 0.605]])}" stroke="#c9b48a" stroke-width="4" stroke-linecap="round"/>`);
  }
  // range / oven
  s.box(STOVE_X0, STOVE_X1, 0.1, 0.9, 0.02, 0.64, '#3d4144', { front: '#45494c', bias: -0.02 });
  s.raw(2, s.depth([[2.3, 0.5, 0.645]]) - 0.6, `<path d="${s.path([[STOVE_X0 + 0.06, 0.2, 0.645], [STOVE_X1 - 0.06, 0.2, 0.645], [STOVE_X1 - 0.06, 0.68, 0.645], [STOVE_X0 + 0.06, 0.68, 0.645]])}" fill="#1d1f21" stroke="#8b9094" stroke-width="2"/>`);
  for (let i = 0; i < 4; i++) {
    const kx = STOVE_X0 + 0.14 + i * 0.16;
    const k = s.cam.project([kx, 0.79, 0.645]);
    s.raw(2, k.depth - 0.7, `<circle cx="${r1(k.x)}" cy="${r1(k.y)}" r="7" fill="#b8bdc1" stroke="#555" stroke-width="1"/>`);
  }
  s.box(STOVE_X0, STOVE_X1, 0.9, 0.93, 0.02, 0.62, '#202224', { top: '#141516', bias: -0.03 });
  for (const [bx, bz] of [[2.13, 0.2], [2.53, 0.2], [2.13, 0.46], [2.53, 0.46]]) {
    const pts = [];
    for (let a = 0; a < 24; a++) pts.push([bx + 0.085 * Math.cos((a / 24) * Math.PI * 2), 0.932, bz + 0.085 * Math.sin((a / 24) * Math.PI * 2)]);
    s.raw(2, s.depth([[bx, 0.93, bz]]) - 1, `<path d="${s.path(pts)}" fill="none" stroke="#5a5e62" stroke-width="2"/>`);
  }
  // hood: canopy + chimney
  s.box(STOVE_X0 - 0.04, STOVE_X1 + 0.04, HOOD_Y, HOOD_Y + 0.14, 0, 0.5, '#b9bec2', { bottom: '#8e9397', front: '#c6cbcf' });
  s.box(2.18, 2.48, HOOD_Y + 0.14, CEIL, 0, 0.26, '#b4b9bd', { front: '#c3c8cc' });
  // upper cabinets
  for (const [x0, x1] of [[FRIDGE_X1, STOVE_X0 - 0.12], [UPPER_R_X0, WALL_X1]]) {
    s.box(x0, x1, BACK_Y1, 2.3, 0, 0.36, '#eeebe5', { front: '#f3f0ea', bottom: '#cfc9c0' });
    for (let x = x0 + 0.5; x < x1 - 0.1; x += 0.5) {
      s.raw(2, s.depth([[x, 1.9, 0.36]]) - 0.4, `<path d="${s.line([[x, BACK_Y1 + 0.02, 0.361], [x, 2.28, 0.361]])}" stroke="rgba(60,50,40,.35)" stroke-width="1.3"/>`);
    }
  }
  // faucet (obstacle in front of the backsplash) + sink
  const FX = 3.3;
  s.raw(2, s.depth([[FX, 1, 0.3]]) - 2, `<path d="${s.path([[FX - 0.33, 0.925, 0.12], [FX + 0.33, 0.925, 0.12], [FX + 0.33, 0.925, 0.52], [FX - 0.33, 0.925, 0.52]])}" fill="#c4c8cb" stroke="#80868b" stroke-width="2"/>`);
  const neck = [];
  for (let a = 0; a <= 16; a++) {
    const t = (a / 16) * Math.PI;
    neck.push([FX, 0.93 + 0.34 * Math.sin(t) + (a < 8 ? 0 : 0), 0.08 + 0.17 * (1 - Math.cos(t))]);
  }
  const neckPath = s.line([[FX, 0.92, 0.08], ...neck]);
  s.raw(2, s.depth([[FX, 1.1, 0.1]]) - 3, `<path d="${neckPath}" fill="none" stroke="#9aa0a5" stroke-width="13" stroke-linecap="round"/><path d="${neckPath}" fill="none" stroke="#d7dbde" stroke-width="5" stroke-linecap="round"/>`);
  // faucet cutout: silhouette of neck as seen against the wall (projected onto z=0 along the view ray)
  const faucetOnWall = (P) => {
    const C = s.cam.pos;
    const t = C[2] / (C[2] - P[2]);
    return [C[0] + (P[0] - C[0]) * t, C[1] + (P[1] - C[1]) * t, 0];
  };
  const fw = 0.035;
  const faucetSil = [
    [FX - fw, 0.93, 0.08], [FX - fw, 1.2, 0.09], [FX - fw, 1.3, 0.18], [FX - fw, 1.28, 0.3], [FX + fw, 1.28, 0.3], [FX + fw, 1.3, 0.18], [FX + fw, 1.2, 0.09], [FX + fw, 0.93, 0.08],
  ];
  const faucetCut = norm2(s, faucetSil.map(faucetOnWall));

  // Preset geometry ----------------------------------------------------------------------------
  // Backsplash outline: counter to cabinet underside, taller behind the hob (up to the hood).
  const backsplash = norm2(s, [
    [FRIDGE_X1, BACK_Y0, 0],
    [WALL_X1, BACK_Y0, 0],
    [WALL_X1, BACK_Y1, 0],
    [UPPER_R_X0, BACK_Y1, 0],
    [UPPER_R_X0, HOOD_Y, 0],
    [STOVE_X0 - 0.12, HOOD_Y, 0],
    [STOVE_X0 - 0.12, BACK_Y1, 0],
    [FRIDGE_X1, BACK_Y1, 0],
  ]);
  const backsplashFrame = norm2(s, [[FRIDGE_X1, HOOD_Y, 0], [WALL_X1, HOOD_Y, 0], [WALL_X1, BACK_Y0, 0], [FRIDGE_X1, BACK_Y0, 0]]);
  const upperDoors = norm2(s, [[FRIDGE_X1, 2.3, 0.36], [STOVE_X0 - 0.12, 2.3, 0.36], [STOVE_X0 - 0.12, BACK_Y1, 0.36], [FRIDGE_X1, BACK_Y1, 0.36]]);

  return {
    svg: s.svg(),
    presets: [
      {
        name: 'Backsplash',
        boundary: backsplash,
        exclusions: [...outletPolys, faucetCut],
        perspective: backsplashFrame,
        surfaceAspect: +((WALL_X1 - FRIDGE_X1) / (HOOD_Y - BACK_Y0)).toFixed(4),
        artworkId: 'art-carrara',
        materialId: 'mat-gloss-tile',
      },
      {
        name: 'Upper cabinet doors',
        boundary: upperDoors,
        exclusions: [],
        perspective: upperDoors,
        surfaceAspect: +((STOVE_X0 - 0.12 - FRIDGE_X1) / (2.3 - BACK_Y1)).toFixed(4),
        artworkId: null,
        materialId: 'mat-cabinet-lacquer',
      },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Scene 2 — Bathroom: shower wall with niche, glass partition, vanity with mirror
// ---------------------------------------------------------------------------------------------
function bathroom() {
  const s = new Scene(camera({ pos: [1.75, 1.45, 3.6], yaw: -9, pitch: -3, focal: 1150 }));
  const X1 = 3.2;
  const CEIL = 2.6;
  wallGradient(s, 'bBack', [0, 2, 0], [X1, 2, 0], [[0, '#dfe1df'], [0.5, '#e8e9e6'], [1, '#d6d6d1']]);
  wallGradient(s, 'bLeft', [0, 2, 0], [0, 2, 3], [[0, '#c9ccca'], [1, '#b9bcba']]);
  wallGradient(s, 'bRight', [X1, 2, 0], [X1, 2, 3], [[0, '#d0d0cb'], [1, '#c0c0ba']]);
  s.poly(0, [[0, 0, 0], [X1, 0, 0], [X1, CEIL, 0], [0, CEIL, 0]], 'fill="url(#bBack)"');
  s.poly(0, [[0, 0, 0], [0, 0, 3], [0, CEIL, 3], [0, CEIL, 0]], 'fill="url(#bLeft)"');
  s.poly(0, [[X1, 0, 0], [X1, 0, 3], [X1, CEIL, 3], [X1, CEIL, 0]], 'fill="url(#bRight)"');
  s.poly(0, [[0, 0, 0], [X1, 0, 0], [X1, 0, 3], [0, 0, 3]], 'fill="#9e9a92"');
  s.poly(0, [[0, CEIL, 0], [X1, CEIL, 0], [X1, CEIL, 3], [0, CEIL, 3]], 'fill="#f3f3f1"');
  for (let x = 0; x <= X1; x += 0.6) s.raw(0, 99, `<path d="${s.line([[x, 0.001, 0], [x, 0.001, 3]])}" stroke="rgba(50,45,40,.25)" stroke-width="1.2"/>`);
  for (let z = 0; z <= 3; z += 0.6) s.raw(0, 99, `<path d="${s.line([[0, 0.001, z], [X1, 0.001, z]])}" stroke="rgba(50,45,40,.25)" stroke-width="1.2"/>`);
  const glow = s.path([[1.6, 0.4, 0], [3, 0.4, 0], [3, 2.3, 0], [1.6, 2.3, 0]]);
  s.raw(1, 0, `<path d="${glow}" fill="#fff" opacity=".3" filter="url(#softer)"/>`);

  const SHOWER_X1 = 1.3;
  // shower tray
  s.box(0, SHOWER_X1, 0, 0.05, 0, 1.0, '#e9e9e6');
  // niche (recess drawn as darker inset with inner shadow)
  const niche = [[0.3, 1.15, 0], [0.85, 1.15, 0], [0.85, 1.5, 0], [0.3, 1.5, 0]];
  s.poly(1, niche, 'fill="#b9bab6" stroke="#8c8d89" stroke-width="1.5"');
  s.raw(1, 0, `<path d="${s.path([[0.3, 1.42, 0], [0.85, 1.42, 0], [0.85, 1.5, 0], [0.3, 1.5, 0]])}" fill="#7e7f7b" opacity=".6"/>`);
  for (const [bx, h, c] of [[0.42, 0.17, '#e6d6c3'], [0.58, 0.22, '#9fb3c4'], [0.72, 0.14, '#f1efe8']]) {
    s.poly(1, [[bx - 0.045, 1.15, 0], [bx + 0.045, 1.15, 0], [bx + 0.045, 1.15 + h, 0], [bx - 0.045, 1.15 + h, 0]], `fill="${c}" stroke="rgba(0,0,0,.25)"`);
  }
  // shower valve + riser
  s.poly(1, [[0.98, 0.98, 0], [1.1, 0.98, 0], [1.1, 1.1, 0], [0.98, 1.1, 0]], 'fill="#c8ccd0" stroke="#7b8085" stroke-width="1.5"');
  s.raw(1, 0, `<path d="${s.line([[1.04, 1.1, 0], [1.04, 2.05, 0]])}" stroke="#a3a8ad" stroke-width="7" stroke-linecap="round"/>`);
  s.box(0.96, 1.12, 2.03, 2.07, 0, 0.18, '#b8bdc2');

  // vanity + mirror
  const MIR = [[2.05, 1.2, 0], [2.95, 1.2, 0], [2.95, 2.05, 0], [2.05, 2.05, 0]];
  s.poly(1, MIR, 'fill="#c9d3d8" stroke="#6f777c" stroke-width="3"');
  s.raw(1, 0, `<path d="${s.path([[2.15, 1.3, 0], [2.4, 1.3, 0], [2.7, 1.95, 0], [2.45, 1.95, 0]])}" fill="#fff" opacity=".35"/>`);
  s.box(1.95, 3.05, 0.25, 0.82, 0, 0.5, '#8a6a4b', { front: '#926f4f' });
  s.box(1.92, 3.08, 0.82, 0.86, 0, 0.52, '#f1f0ec');
  s.raw(2, s.depth([[2.5, 0.55, 0.5]]) - 0.5, `<path d="${s.line([[2.5, 0.28, 0.501], [2.5, 0.8, 0.501]])}" stroke="rgba(30,20,10,.5)" stroke-width="1.5"/>`);

  // glass partition: plane x = SHOWER_X1, z 0..1.0, y 0.05..2.05 — semi-transparent
  const glass = [[SHOWER_X1, 0.05, 0], [SHOWER_X1, 0.05, 1.0], [SHOWER_X1, 2.05, 1.0], [SHOWER_X1, 2.05, 0]];
  s.raw(2, s.depth(glass) - 5, `<path d="${s.path(glass)}" fill="#d8eef0" fill-opacity=".22" stroke="#9aa3a8" stroke-width="3"/>`);
  s.raw(2, s.depth(glass) - 5.1, `<path d="${s.path([[SHOWER_X1, 0.4, 0.15], [SHOWER_X1, 0.4, 0.3], [SHOWER_X1, 1.9, 0.75], [SHOWER_X1, 1.9, 0.6]])}" fill="#fff" opacity=".22"/>`);

  // Preset geometry
  const showerWall = norm2(s, [[0, 0.05, 0], [SHOWER_X1, 0.05, 0], [SHOWER_X1, 2.2, 0], [0, 2.2, 0]]);
  const vanityWall = norm2(s, [[1.92, 0.86, 0], [X1, 0.86, 0], [X1, 2.2, 0], [1.92, 2.2, 0]]);
  const mirror = norm2(s, [[2.03, 1.18, 0], [2.97, 1.18, 0], [2.97, 2.07, 0], [2.03, 2.07, 0]]);
  return {
    svg: s.svg(),
    presets: [
      {
        name: 'Shower wall',
        boundary: showerWall,
        exclusions: [
          norm2(s, [[0.28, 1.13, 0], [0.87, 1.13, 0], [0.87, 1.52, 0], [0.28, 1.52, 0]]),
          norm2(s, [[0.96, 0.96, 0], [1.12, 0.96, 0], [1.12, 2.12, 0], [0.96, 2.12, 0]]),
        ],
        perspective: showerWall,
        surfaceAspect: +(SHOWER_X1 / 2.15).toFixed(4),
        artworkId: 'art-ocean',
        materialId: 'mat-matte-tile',
      },
      {
        name: 'Vanity wall',
        boundary: vanityWall,
        exclusions: [mirror],
        perspective: vanityWall,
        surfaceAspect: +((X1 - 1.92) / (2.2 - 0.86)).toFixed(4),
        artworkId: null,
        materialId: 'mat-gloss-tile',
      },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Scene 3 — Commercial reception: feature wall behind a desk, glass-block partition
// ---------------------------------------------------------------------------------------------
function office() {
  const s = new Scene(camera({ pos: [2.75, 1.6, 5.0], yaw: 4, pitch: -4, focal: 1080 }));
  const X1 = 6.0;
  const CEIL = 3.0;
  wallGradient(s, 'oBack', [0, 2, 0], [X1, 2, 0], [[0, '#e9e6e1'], [0.55, '#e1ddd6'], [1, '#d2cdc5']]);
  wallGradient(s, 'oLeft', [0, 2, 0], [0, 2, 4.5], [[0, '#c9c4bc'], [1, '#b5afa6']]);
  wallGradient(s, 'oFloor', [2, 0, 0], [2, 0, 4.5], [[0, '#6b6763'], [1, '#4f4c49']]);
  s.poly(0, [[0, 0, 0], [X1, 0, 0], [X1, CEIL, 0], [0, CEIL, 0]], 'fill="url(#oBack)"');
  s.poly(0, [[0, 0, 0], [0, 0, 4.6], [0, CEIL, 4.6], [0, CEIL, 0]], 'fill="url(#oLeft)"');
  wallGradient(s, 'oRight', [X1, 2, 0], [X1, 2, 4.5], [[0, '#d3cec6'], [1, '#c2bcb3']]);
  s.poly(0, [[X1, 0, 0], [X1, 0, 4.6], [X1, CEIL, 4.6], [X1, CEIL, 0]], 'fill="url(#oRight)"');
  s.poly(0, [[0, 0, 0], [X1, 0, 0], [X1, 0, 4.6], [0, 0, 4.6]], 'fill="url(#oFloor)"');
  s.poly(0, [[0, CEIL, 0], [X1, CEIL, 0], [X1, CEIL, 4.6], [0, CEIL, 4.6]], 'fill="#f1f0ee"');
  for (let x = 0.6; x < X1; x += 1.2) {
    const c = s.cam.project([x, CEIL - 0.001, 1.4]);
    s.raw(0, 99, `<ellipse cx="${r1(c.x)}" cy="${r1(c.y)}" rx="34" ry="7" fill="#fffdf4"/>`);
  }
  for (const x of [0.9, 2.1, 3.3, 4.5]) {
    const g = s.path([[x - 0.45, 1.3, 0], [x + 0.45, 1.3, 0], [x + 0.25, CEIL, 0], [x - 0.25, CEIL, 0]]);
    s.raw(1, 0, `<path d="${g}" fill="#fff8e6" opacity=".3" filter="url(#soft)"/>`);
  }
  // skirting
  s.poly(1, [[0, 0, 0], [X1, 0, 0], [X1, 0.1, 0], [0, 0.1, 0]], 'fill="#3d3a37"');
  // reception desk in front of the feature wall
  s.box(0.8, 3.4, 0, 1.05, 1.1, 1.75, '#f2efe9', { front: '#ebe7e0', top: '#2c2a28', bias: -0.2 });
  s.box(0.75, 3.45, 1.05, 1.09, 1.05, 1.8, '#3a3633', { top: '#2a2725', bias: -0.25 });
  s.raw(2, s.depth([[2.1, 0.5, 1.76]]) - 0.4, `<path d="${s.line([[0.8, 0.95, 1.752], [3.4, 0.95, 1.752]])}" stroke="#b8a37e" stroke-width="4"/>`);
  // monitor
  s.box(1.7, 2.25, 1.15, 1.48, 1.35, 1.38, '#202326', { bias: -0.4 });
  s.box(1.95, 2.0, 1.09, 1.15, 1.37, 1.4, '#3b3f42', { bias: -0.4 });
  // planter
  s.box(0.2, 0.6, 0, 0.55, 2.0, 2.4, '#6e6a63', { bias: -0.1 });
  const leaves = [];
  const base = s.cam.project([0.4, 0.55, 2.2]);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const tip = s.cam.project([0.4 + 0.32 * Math.cos(a), 1.2 + 0.25 * Math.sin(i * 1.7), 2.2 + 0.2 * Math.sin(a)]);
    leaves.push(`<path d="M${r1(base.x)},${r1(base.y)} Q${r1((base.x + tip.x) / 2 + 25)},${r1((base.y + tip.y) / 2)} ${r1(tip.x)},${r1(tip.y)}" stroke="#3f6b45" stroke-width="9" fill="none" stroke-linecap="round"/>`);
  }
  s.raw(2, s.depth([[0.4, 0.8, 2.2]]) - 0.6, leaves.join(''));

  // glass-block partition on the right, parallel to the back wall
  const PZ = 0.9;
  const PX0 = 3.9;
  const PX1 = 5.5;
  const PY1 = 2.3;
  const part = [[PX0, 0, PZ], [PX1, 0, PZ], [PX1, PY1, PZ], [PX0, PY1, PZ]];
  s.box(PX0, PX1, 0, PY1, PZ - 0.05, PZ, '#cfdcdd', { front: '#d9e5e6', bias: -1 });
  s.raw(2, s.depth(part) - 1.2, `<path d="${s.path(part)}" fill="#e7f0f1" fill-opacity=".35" stroke="#9aa6a8" stroke-width="3"/>`);
  for (let x = PX0; x <= PX1 + 1e-6; x += (PX1 - PX0) / 8) s.raw(2, s.depth(part) - 1.3, `<path d="${s.line([[x, 0, PZ + 0.001], [x, PY1, PZ + 0.001]])}" stroke="rgba(120,135,138,.6)" stroke-width="2.5"/>`);
  for (let y = 0; y <= PY1 + 1e-6; y += PY1 / 11) s.raw(2, s.depth(part) - 1.3, `<path d="${s.line([[PX0, y, PZ + 0.001], [PX1, y, PZ + 0.001]])}" stroke="rgba(120,135,138,.6)" stroke-width="2.5"/>`);

  // desk silhouette against the back wall (projected along view rays onto z = 0)
  const onWall = (P) => {
    const C = s.cam.pos;
    const t = C[2] / (C[2] - P[2]);
    return [C[0] + (P[0] - C[0]) * t, C[1] + (P[1] - C[1]) * t, 0];
  };
  const deskTopL = onWall([0.75, 1.09, 1.05]);
  const deskTopR = onWall([3.45, 1.09, 1.05]);
  const monL = onWall([1.7, 1.48, 1.35]);
  const monR = onWall([2.25, 1.48, 1.35]);
  const deskTop = Math.max(deskTopL[1], deskTopR[1]) + 0.02;
  const deskCut = [
    [deskTopL[0] - 0.03, 0.1, 0],
    [deskTopL[0] - 0.03, deskTop, 0],
    [monL[0] - 0.03, deskTop, 0],
    [monL[0] - 0.03, monL[1] + 0.03, 0],
    [monR[0] + 0.03, monR[1] + 0.03, 0],
    [monR[0] + 0.03, deskTop, 0],
    [deskTopR[0] + 0.03, deskTop, 0],
    [deskTopR[0] + 0.03, 0.1, 0],
  ];
  const FX1 = 3.75;
  const feature = norm2(s, [[0.0, 0.1, 0], [FX1, 0.1, 0], [FX1, 2.8, 0], [0.0, 2.8, 0]]);
  return {
    svg: s.svg(),
    presets: [
      {
        name: 'Feature wall',
        boundary: feature,
        exclusions: [norm2(s, deskCut)],
        perspective: norm2(s, [[0.0, 2.8, 0], [FX1, 2.8, 0], [FX1, 0.1, 0], [0.0, 0.1, 0]]),
        surfaceAspect: +(FX1 / 2.7).toFixed(4),
        artworkId: 'art-botanical',
        materialId: 'mat-wall-panel',
      },
      {
        name: 'Glass-block partition',
        boundary: norm2(s, part),
        exclusions: [],
        perspective: norm2(s, [[PX0, PY1, PZ], [PX1, PY1, PZ], [PX1, 0, PZ], [PX0, 0, PZ]]),
        surfaceAspect: +((PX1 - PX0) / PY1).toFixed(4),
        artworkId: null,
        materialId: 'mat-glass-block',
      },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Artwork (original generative designs)
// ---------------------------------------------------------------------------------------------
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ART_W = 1600;
const ART_H = 1000;
const artSvg = (inner, w = ART_W, h = ART_H, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${inner}</svg>`;

const ARTWORK = {
  carrara: () =>
    artSvg(
      `<rect width="100%" height="100%" fill="#f2f0eb"/><rect width="100%" height="100%" filter="url(#cloud)"/><rect width="100%" height="100%" filter="url(#veins)"/><rect width="100%" height="100%" filter="url(#veins2)"/>`,
      ART_W,
      ART_H,
      `<filter id="cloud" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.0018 0.004" numOctaves="4" seed="21"/><feColorMatrix type="matrix" values="0 0 0 0 0.78  0 0 0 0 0.77  0 0 0 0 0.75  1.2 0 0 0 -0.55"/></filter>
       <filter id="veins" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.0022 0.0065" numOctaves="6" seed="3"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0 0 0 0 0 0 0 0 0 0.9 0 0 0 0 0 0 0 0 0 0"/></feComponentTransfer><feGaussianBlur stdDeviation="0.7"/><feColorMatrix type="matrix" values="0 0 0 0 0.36  0 0 0 0 0.37  0 0 0 0 0.40  0 0 0 1 0"/></filter>
       <filter id="veins2" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.003 0.009" numOctaves="5" seed="17"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0 0 0 0 0 0 0 0 0.5 0 0 0 0 0 0 0 0 0"/></feComponentTransfer><feGaussianBlur stdDeviation="1.4"/><feColorMatrix type="matrix" values="0 0 0 0 0.62  0 0 0 0 0.57  0 0 0 0 0.50  0 0 0 1 0"/></filter>`,
    ),
  terrazzo: () => {
    const r = rng(42);
    const colors = ['#c8553d', '#2d6a6a', '#e3b04b', '#8c8c88', '#3d405b', '#f2a07b'];
    let chips = '';
    for (let i = 0; i < 520; i++) {
      const cx = r() * ART_W;
      const cy = r() * ART_H;
      const n = 4 + Math.floor(r() * 4);
      const size = 6 + r() * 26;
      const pts = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r() * 0.6;
        const rad = size * (0.55 + r() * 0.5);
        pts.push(`${r1(cx + Math.cos(a) * rad)},${r1(cy + Math.sin(a) * rad)}`);
      }
      chips += `<polygon points="${pts.join(' ')}" fill="${colors[Math.floor(r() * colors.length)]}" opacity="${(0.8 + r() * 0.2).toFixed(2)}"/>`;
    }
    return artSvg(`<rect width="100%" height="100%" fill="#efe8dc"/>${chips}`);
  },
  grid: () => {
    let lines = '';
    for (let x = 0; x <= ART_W; x += 100) lines += `<rect x="${x - 3}" y="0" width="6" height="${ART_H}" fill="#1f3b4d"/>`;
    for (let y = 0; y <= ART_H; y += 100) lines += `<rect x="0" y="${y - 3}" width="${ART_W}" height="6" fill="#1f3b4d"/>`;
    let accents = '';
    const r = rng(9);
    for (let i = 0; i < 26; i++) {
      const gx = Math.floor(r() * 16) * 100;
      const gy = Math.floor(r() * 10) * 100;
      accents += `<rect x="${gx + 3}" y="${gy + 3}" width="94" height="94" fill="${['#e07a5f', '#f2cc8f', '#81b29a'][i % 3]}"/>`;
    }
    return artSvg(`<rect width="100%" height="100%" fill="#f4f1de"/>${accents}${lines}<rect x="0" y="0" width="${ART_W}" height="${ART_H}" fill="none" stroke="#1f3b4d" stroke-width="16"/>`);
  },
  ocean: () => {
    const bands = ['#0b3954', '#087e8b', '#3fa7b5', '#8fd3d6', '#d9f0ee', '#f5efe0'];
    let paths = '';
    bands.forEach((c, i) => {
      const y0 = 120 + i * 150;
      let d = `M0,${ART_H} L0,${y0}`;
      for (let x = 0; x <= ART_W; x += 40) d += ` L${x},${r1(y0 + 46 * Math.sin(x / 170 + i * 0.9) + 22 * Math.sin(x / 61 + i))}`;
      d += ` L${ART_W},${ART_H} Z`;
      paths += `<path d="${d}" fill="${c}"/>`;
    });
    return artSvg(`<rect width="100%" height="100%" fill="#062c43"/>${paths.split('</path>').reverse().join('</path>')}`.replace('</path></path>', '</path>'));
  },
  botanical: () => {
    const r = rng(5);
    let leaves = '';
    const greens = ['#2f5d50', '#4e8a6e', '#7fb08c', '#a7c4a0', '#1f4037'];
    for (let i = 0; i < 70; i++) {
      const x = r() * ART_W;
      const y = r() * ART_H;
      const rot = r() * 360;
      const s = 60 + r() * 120;
      const c = greens[Math.floor(r() * greens.length)];
      leaves += `<g transform="translate(${r1(x)},${r1(y)}) rotate(${r1(rot)})"><path d="M0,0 C${r1(s * 0.35)},${r1(-s * 0.5)} ${r1(s * 0.9)},${r1(-s * 0.35)} ${r1(s)},0 C${r1(s * 0.9)},${r1(s * 0.35)} ${r1(s * 0.35)},${r1(s * 0.5)} 0,0Z" fill="${c}"/><path d="M0,0 L${r1(s * 0.95)},0" stroke="#e9efe4" stroke-width="2.5" opacity=".6"/></g>`;
    }
    return artSvg(`<rect width="100%" height="100%" fill="#f3efe4"/>${leaves}`);
  },
  sunset: () =>
    artSvg(
      `<rect width="100%" height="100%" fill="url(#sky)"/><circle cx="1050" cy="520" r="230" fill="#ffd27f" opacity=".95"/><circle cx="380" cy="300" r="320" fill="#ff8a5b" opacity=".55" filter="url(#b)"/><circle cx="1350" cy="850" r="380" fill="#6a4c93" opacity=".55" filter="url(#b)"/><rect y="700" width="100%" height="300" fill="#3b1f4a" opacity=".55"/>`,
      ART_W,
      ART_H,
      `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2d6e"/><stop offset=".55" stop-color="#d1495b"/><stop offset="1" stop-color="#edae49"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="60"/></filter>`,
    ),
  hex: () => {
    const R = 70;
    const w = Math.sqrt(3) * R;
    let cells = '';
    let row = 0;
    for (let y = 0; y < ART_H + R; y += R * 1.5, row++) {
      for (let x = row % 2 ? w / 2 : 0; x < ART_W + w; x += w) {
        const pts = [];
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          pts.push(`${r1(x + R * 0.94 * Math.cos(a))},${r1(y + R * 0.94 * Math.sin(a))}`);
        }
        const tone = (Math.floor(x / w) + row) % 3;
        cells += `<polygon points="${pts.join(' ')}" fill="${['#14213d', '#1d3461', '#0f1a30'][tone]}" stroke="#c9a227" stroke-width="5"/>`;
      }
    }
    return artSvg(`<rect width="100%" height="100%" fill="#c9a227"/>${cells}`);
  },
  deco: () => {
    let fans = '';
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 10; col++) {
        const cx = col * 180 + (row % 2 ? 90 : 0);
        const cy = row * 160 + 160;
        for (let k = 5; k >= 1; k--) fans += `<path d="M${cx - k * 18},${cy} A${k * 18},${k * 18} 0 0 1 ${cx + k * 18},${cy}Z" fill="${k % 2 ? '#b87333' : '#1c2321'}"/>`;
      }
    }
    return artSvg(`<rect width="100%" height="100%" fill="#1c2321"/>${fans}`);
  },
};

// ---------------------------------------------------------------------------------------------
async function render(page, svg, w, h, file, quality = 88) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">${svg.replace(/width="\d+" height="\d+" viewBox/, `width="${w}" height="${h}" viewBox`)}</body></html>`);
  await page.waitForTimeout(50);
  await mkdir(dirname(file), { recursive: true });
  await page.screenshot({ path: file, type: 'jpeg', quality, clip: { x: 0, y: 0, width: w, height: h } });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const geometry = {};
  for (const [name, build] of Object.entries({ kitchen, bathroom, office })) {
    const { svg, presets } = build();
    await render(page, svg, W, H, join(OUT, 'rooms', `${name}.jpg`), 86);
    await render(page, svg, 480, Math.round((480 * H) / W), join(OUT, 'rooms', 'thumbs', `${name}.jpg`), 80);
    geometry[name] = presets;
    console.log('room', name);
  }
  for (const [name, build] of Object.entries(ARTWORK)) {
    const svg = build();
    await render(page, svg, ART_W, ART_H, join(OUT, 'artwork', `${name}.jpg`), 88);
    await render(page, svg, 320, 200, join(OUT, 'artwork', 'thumbs', `${name}.jpg`), 80);
    console.log('artwork', name);
  }
  await browser.close();
  await writeFile(join(ROOT, 'src', 'catalog', 'demoGeometry.json'), JSON.stringify(geometry, null, 1) + '\n');
  console.log('wrote src/catalog/demoGeometry.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
