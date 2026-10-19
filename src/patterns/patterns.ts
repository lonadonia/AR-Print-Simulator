/**
 * Pattern Maker: parametric, recolourable designs generated in the browser.
 *
 * Tile patterns are drawn as seamless tiles (every shape is also drawn shifted by ±tile size so
 * it wraps across the edges) and are applied with "repeat" on, so they can cover any surface.
 * Panel patterns (e.g. the privacy gradient for glass partitions) are single, non-repeating
 * designs. Nothing here uses external images.
 */

export type PatternGroup = 'geometric' | 'ornamental' | 'organic' | 'glass';

export interface PatternDef {
  id: string;
  name: string;
  group: PatternGroup;
  /** true: seamless tile applied with repeat; false: one panel covering the area */
  tile: boolean;
  /** tile width / height */
  aspect: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, c: Palette, rnd: () => number) => void;
}

/** [background, main, second, accent] as #rrggbb */
export type Palette = [string, string, string, string];

export interface Colourway {
  id: string;
  name: string;
  colors: Palette;
}

export const PATTERN_GROUPS: { id: PatternGroup; name: string }[] = [
  { id: 'geometric', name: 'Geometric' },
  { id: 'ornamental', name: 'Ornamental & tile' },
  { id: 'organic', name: 'Soft & organic' },
  { id: 'glass', name: 'Glass & privacy' },
];

export const COLOURWAYS: Colourway[] = [
  { id: 'ivory-gold', name: 'Ivory & gold', colors: ['#f4efe6', '#c9a227', '#8a6f2e', '#ffffff'] },
  { id: 'navy-brass', name: 'Navy & brass', colors: ['#14213d', '#c9a227', '#1d3461', '#e5e5e5'] },
  { id: 'majorelle', name: 'Majorelle blue', colors: ['#f5efe0', '#2e4bc6', '#f2b705', '#e9e4d8'] },
  { id: 'terracotta', name: 'Terracotta', colors: ['#f2e3d5', '#c8553d', '#8c3b2a', '#f2a07b'] },
  { id: 'sage', name: 'Sage & cream', colors: ['#f3efe4', '#7fb08c', '#2f5d50', '#c9d8b6'] },
  { id: 'emerald', name: 'Emerald & marble', colors: ['#eef0ec', '#1f5f4a', '#b9c4bc', '#c9a227'] },
  { id: 'teal-sand', name: 'Teal & sand', colors: ['#e9dcc4', '#1f6f78', '#0b3954', '#f2cc8f'] },
  { id: 'ocean', name: 'Ocean', colors: ['#e8f3f6', '#087e8b', '#0b3954', '#8fd3d6'] },
  { id: 'charcoal-copper', name: 'Charcoal & copper', colors: ['#22262a', '#b87333', '#3a4046', '#e0c0a0'] },
  { id: 'blush', name: 'Blush & grey', colors: ['#f7e7e3', '#d8a7a0', '#6b6e70', '#ffffff'] },
  { id: 'desert-rose', name: 'Desert rose', colors: ['#efe2d0', '#b56576', '#6d597a', '#e9c46a'] },
  { id: 'mono', name: 'Monochrome', colors: ['#ffffff', '#1c1d20', '#8a8d91', '#d9d9d9'] },
];

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Mix two colours (t = 0 → a, 1 → b) */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Lighten (k > 0) or darken (k < 0) */
export function shade(hex: string, k: number): string {
  return k >= 0 ? mix(hex, '#ffffff', k) : mix(hex, '#000000', -k);
}

/** Calls `fn` for the tile and its 8 neighbours so shapes crossing an edge wrap around. */
function wrapped(ctx: CanvasRenderingContext2D, w: number, h: number, fn: () => void) {
  for (const oy of [-h, 0, h])
    for (const ox of [-w, 0, w]) {
      ctx.save();
      ctx.translate(ox, oy);
      fn();
      ctx.restore();
    }
}

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][], fill?: string, stroke?: string, lw = 1) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function bg(ctx: CanvasRenderingContext2D, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

// ---------------------------------------------------------------------------------------------
// Pattern definitions
// ---------------------------------------------------------------------------------------------
export const PATTERNS: PatternDef[] = [
  {
    id: 'stripes',
    name: 'Diagonal stripes',
    group: 'geometric',
    tile: true,
    aspect: 1,
    draw(ctx, w, h, c) {
      bg(ctx, w, h, c[0]);
      const p = w / 4;
      for (let k = -8; k <= 8; k++) {
        const o = k * p;
        poly(ctx, [[o, 0], [o + p * 0.5, 0], [o + p * 0.5 - h, h], [o - h, h]], k % 2 ? c[1] : c[2]);
        ctx.strokeStyle = c[3];
        ctx.lineWidth = w * 0.006;
        ctx.beginPath();
        ctx.moveTo(o + p * 0.75, 0);
        ctx.lineTo(o + p * 0.75 - h, h);
        ctx.stroke();
      }
    },
  },
  {
    id: 'chevron',
    name: 'Chevron',
    group: 'geometric',
    tile: true,
    aspect: 1,
    draw(ctx, w, h, c) {
      bg(ctx, w, h, c[0]);
      const rows = 6;
      const rh = h / rows;
      const per = w / 3;
      const amp = rh * 0.9;
      for (let r = -1; r <= rows; r++) {
        const y = r * rh;
        const pts: [number, number][] = [];
        for (let x = -per; x <= w + per; x += per / 2) pts.push([x, y + ((Math.round(x / (per / 2)) % 2) + 2) % 2 * amp * 0.5]);
        const band = [...pts, ...pts.slice().reverse().map(([x, yy]) => [x, yy + rh * 0.5] as [number, number])];
        poly(ctx, band, [c[1], c[2], c[3]][((r % 3) + 3) % 3]);
      }
    },
  },
  {
    id: 'herringbone',
    name: 'Herringbone',
    group: 'geometric',
    tile: true,
    aspect: 1,
    draw(ctx, w, h, c, rnd) {
      bg(ctx, w, h, c[3]);
      // 2:1 blocks laid at 45°. In the rotated frame the pattern repeats every √2·u horizontally
      // and 2√2·u vertically, so a square tile of 4√2·u is seamless.
      const u = w / (4 * Math.SQRT2);
      const gap = 0.07;
      ctx.save();
      ctx.rotate(-Math.PI / 4);
      ctx.scale(u, u);
      const block = (x: number, y: number, bw: number, bh: number, col: string) => {
        ctx.fillStyle = col;
        ctx.fillRect(x + gap, y + gap, bw - 2 * gap, bh - 2 * gap);
      };
      for (let b = -6; b <= 6; b++)
        for (let t = -16; t <= 16; t++) {
          block(t + 4 * b, t, 2, 1, shade(c[1], (rnd() - 0.5) * 0.14));
          block(t + 2 + 4 * b, t - 1, 1, 2, shade(c[2], (rnd() - 0.5) * 0.14));
        }
      ctx.restore();
    },
  },
  {
    id: 'cubes',
    name: 'Tumbling cubes',
    group: 'geometric',
    tile: true,
    aspect: 1.1547,
    draw(ctx, w, h, c) {
      bg(ctx, w, h, c[0]);
      const r = h / 3; // hex circumradius (rows of pointy-top hexagons)
      const hw = w / 4; // half hex width (two hexes per tile)
      const cube = (cx: number, cy: number) => {
        const top: [number, number][] = [[cx, cy - r], [cx + hw, cy - r / 2], [cx, cy], [cx - hw, cy - r / 2]];
        const left: [number, number][] = [[cx - hw, cy - r / 2], [cx, cy], [cx, cy + r], [cx - hw, cy + r / 2]];
        const right: [number, number][] = [[cx + hw, cy - r / 2], [cx + hw, cy + r / 2], [cx, cy + r], [cx, cy]];
        poly(ctx, top, shade(c[1], 0.25));
        poly(ctx, left, c[1]);
        poly(ctx, right, c[2]);
      };
      wrapped(ctx, w, h, () => {
        for (let row = 0; row < 2; row++)
          for (let col = 0; col < 2; col++) cube(hw + col * 2 * hw + (row % 2) * hw, r + row * 1.5 * r);
      });
    },
  },
  {
    id: 'triangles',
    name: 'Triangle mosaic',
    group: 'geometric',
    tile: true,
    aspect: 1,
    draw(ctx, w, h, c, rnd) {
      const n = 6;
      const p = w / n;
      const q = h / n;
      const cols = [c[1], c[2], c[3], c[0], shade(c[1], 0.3)];
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const x = i * p;
          const y = j * q;
          poly(ctx, [[x, y], [x + p, y], [x, y + q]], cols[Math.floor(rnd() * cols.length)]);
          poly(ctx, [[x + p, y], [x + p, y + q], [x, y + q]], cols[Math.floor(rnd() * cols.length)]);
        }
    },
  },
  {
    id: 'harlequin',
    name: 'Harlequin diamonds',
    group: 'geometric',
    tile: true,
    aspect: 1,
    draw(ctx, w, h, c) {
      bg(ctx, w, h, c[2]);
      const p = w / 4;
      wrapped(ctx, w, h, () => {
        for (let j = 0; j < 4; j++)
          for (let i = 0; i < 4; i++) {
            const cx = i * p + p / 2;
            const cy = j * p + p / 2;
            poly(ctx, [[cx, cy - p / 2], [cx + p / 2, cy], [cx, cy + p / 2], [cx - p / 2, cy]], (i + j) % 2 ? c[1] : c[0], c[3], w * 0.004);
          }
      });
    },
  },
  {
    id: 'hexagon',
    name: 'Honeycomb',
    group: 'ornamental',
    tile: true,
    aspect: 1.1547,
    draw(ctx, w, h, c) {
      bg(ctx, w, h, c[0]);
      const r = h / 3;
      const hw = w / 4;
      const hex = (cx: number, cy: number, fill: string) =>
        poly(
          ctx,
          [[cx, cy - r], [cx + hw, cy - r / 2], [cx + hw, cy + r / 2], [cx, cy + r], [cx - hw, cy + r / 2], [cx - hw, cy - r / 2]],
          fill,
          c[1],
          w * 0.018,
        );
      wrapped(ctx, w, h, () => {
        for (let row = 0; row < 2; row++)
          for (let col = 0; col < 2; col++) hex(hw + col * 2 * hw + (row % 2) * hw, r + row * 1.5 * r, (row + col) % 2 ? c[2] : c[0]);
      });
    },
  },
  {
    id: 'quatrefoil',
    name: 'Moroccan quatrefoil',
    group: 'ornamental',
    tile: true,
    aspect: 1,
    draw(ctx, w, h, c) {
      bg(ctx, w, h, c[0]);
      const p = w / 3;
      const r = p * 0.27;
      wrapped(ctx, w, h, () => {
        for (let j = 0; j < 3; j++)
          for (let i = 0; i < 3; i++) {
            const cx = i * p + p / 2;
            const cy = j * p + p / 2;
            ctx.fillStyle = c[1];
            ctx.beginPath();
            for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
              ctx.moveTo(cx + dx + r, cy + dy);
              ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
            }
            ctx.fill();
            ctx.fillStyle = c[0];
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
            ctx.fill();
            poly(ctx, [[i * p, j * p - p * 0.09], [i * p + p * 0.09, j * p], [i * p, j * p + p * 0.09], [i * p - p * 0.09, j * p]], c[2]);
          }
      });
    },
  },
  {
    id: 'star8',
    name: 'Eight-point star',
    group: 'ornamental',
    tile: true,
    aspect: 1,
    draw(ctx, w, h, c) {
      bg(ctx, w, h, c[2]);
      const p = w / 3;
      const star = (cx: number, cy: number, R: number, fill: string, stroke: string) => {
        const pts: [number, number][] = [];
        for (let k = 0; k < 16; k++) {
          const a = (k * Math.PI) / 8;
          const rad = k % 2 ? R * 0.72 : R;
          pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
        }
        poly(ctx, pts, fill, stroke, w * 0.006);
      };
      wrapped(ctx, w, h, () => {
        for (let j = 0; j < 3; j++)
          for (let i = 0; i < 3; i++) {
            star(i * p + p / 2, j * p + p / 2, p * 0.48, c[0], c[3]);
            star(i * p + p / 2, j * p + p / 2, p * 0.3, c[1], c[3]);
            // cross-shaped spaces between stars
            poly(ctx, [[i * p - p * 0.1, j * p], [i * p, j * p - p * 0.1], [i * p + p * 0.1, j * p], [i * p, j * p + p * 0.1]], c[1]);
          }
      });
    },
  },
  {
    id: 'fishscale',
    name: 'Fish scale',
    group: 'ornamental',
    tile: true,
    aspect: 1,
    draw(ctx, w, h, c, rnd) {
      bg(ctx, w, h, c[0]);
      const r = w / 8;
      const items: [number, number, string][] = [];
      for (let oy = -1; oy <= 1; oy++)
        for (let j = 0; j < 8; j++)
          for (let ox = -1; ox <= 1; ox++)
            for (let i = 0; i < 4; i++) items.push([ox * w + i * 2 * r + (j % 2) * r + r, oy * h + j * r, rnd() > 0.5 ? c[1] : c[2]]);
      items.sort((a, b) => a[1] - b[1]);
      for (const [x, y, col] of items) {
        ctx.fillStyle = col;
        ctx.strokeStyle = c[3];
        ctx.lineWidth = w * 0.006;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y - r * 0.15, r * 0.62, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
    },
  },
  {
    id: 'arches',
    name: 'Art deco fans',
    group: 'ornamental',
    tile: true,
    aspect: 1,
    draw(ctx, w, h, c) {
      bg(ctx, w, h, c[0]);
      const r = w / 6;
      const items: [number, number][] = [];
      for (let oy = -1; oy <= 1; oy++)
        for (let j = 0; j < 6; j++)
          for (let ox = -1; ox <= 1; ox++) for (let i = 0; i < 3; i++) items.push([ox * w + i * 2 * r + (j % 2) * r + r, oy * h + j * r]);
      items.sort((a, b) => a[1] - b[1]);
      for (const [x, y] of items) {
        for (let k = 5; k >= 1; k--) {
          ctx.fillStyle = k % 2 ? c[1] : k === 2 ? c[2] : c[0];
          ctx.beginPath();
          ctx.arc(x, y, (r * k) / 5, Math.PI, 0);
          ctx.closePath();
          ctx.fill();
        }
      }
    },
  },
  {
    id: 'encaustic',
    name: 'Encaustic tile',
    group: 'ornamental',
    tile: true,
    aspect: 1,
    draw(ctx, w, h, c) {
      bg(ctx, w, h, c[0]);
      const p = w / 2;
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          const x0 = i * p;
          const y0 = j * p;
          const cx = x0 + p / 2;
          const cy = y0 + p / 2;
          // quarter circles in the corners join into circles across tiles
          ctx.fillStyle = c[2];
          for (const [qx, qy] of [[x0, y0], [x0 + p, y0], [x0, y0 + p], [x0 + p, y0 + p]]) {
            ctx.beginPath();
            ctx.moveTo(qx, qy);
            ctx.arc(qx, qy, p * 0.22, 0, Math.PI * 2);
            ctx.fill();
          }
          // petals
          ctx.fillStyle = c[1];
          for (let k = 0; k < 8; k++) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate((k * Math.PI) / 4);
            ctx.beginPath();
            ctx.ellipse(0, -p * 0.2, p * 0.07, p * 0.17, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
          ctx.fillStyle = c[3];
          ctx.beginPath();
          ctx.arc(cx, cy, p * 0.08, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = c[2];
          ctx.lineWidth = p * 0.025;
          ctx.strokeRect(x0 + p * 0.06, y0 + p * 0.06, p * 0.88, p * 0.88);
        }
    },
  },
  {
    id: 'zellige',
    name: 'Zellige squares',
    group: 'ornamental',
    tile: true,
    aspect: 1,
    draw(ctx, w, h, c, rnd) {
      bg(ctx, w, h, shade(c[0], -0.1));
      const n = 6;
      const p = w / n;
      const g = p * 0.05;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const x = i * p + g;
          const y = j * p + g;
          const s = p - 2 * g;
          const grad = ctx.createLinearGradient(x, y, x + s, y + s);
          const base = shade(c[1], (rnd() - 0.5) * 0.35);
          grad.addColorStop(0, shade(c[1], 0.25));
          grad.addColorStop(0.35, base);
          grad.addColorStop(1, shade(c[1], -0.2 - rnd() * 0.15));
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, s, s);
        }
    },
  },
  {
    id: 'dots',
    name: 'Polka dots',
    group: 'organic',
    tile: true,
    aspect: 1,
    draw(ctx, w, h, c) {
      bg(ctx, w, h, c[0]);
      const n = 6;
      const p = w / n;
      wrapped(ctx, w, h, () => {
        for (let j = 0; j < n; j++)
          for (let i = 0; i < n; i++) {
            ctx.fillStyle = (i + j) % 3 === 0 ? c[2] : c[1];
            ctx.beginPath();
            ctx.arc(i * p + (j % 2) * (p / 2) + p / 4, j * p + p / 2, p * 0.18, 0, Math.PI * 2);
            ctx.fill();
          }
      });
    },
  },
  {
    id: 'waves',
    name: 'Waves',
    group: 'organic',
    tile: true,
    aspect: 1,
    draw(ctx, w, h, c) {
      const rows = 6;
      const rh = h / rows;
      for (let r = -1; r <= rows; r++) {
        ctx.fillStyle = [c[0], c[1], c[2], shade(c[1], 0.35)][((r % 4) + 4) % 4];
        ctx.beginPath();
        ctx.moveTo(0, h + rh);
        for (let x = 0; x <= w; x += w / 64) ctx.lineTo(x, r * rh + Math.sin((x / w) * Math.PI * 4) * rh * 0.35);
        ctx.lineTo(w, h + rh);
        ctx.closePath();
        ctx.fill();
      }
    },
  },
  {
    id: 'terrazzo',
    name: 'Terrazzo',
    group: 'organic',
    tile: true,
    aspect: 1,
    draw(ctx, w, h, c, rnd) {
      bg(ctx, w, h, c[0]);
      const chips: { x: number; y: number; pts: [number, number][]; col: string }[] = [];
      const cols = [c[1], c[2], c[3], shade(c[1], 0.3)];
      for (let k = 0; k < 140; k++) {
        const x = rnd() * w;
        const y = rnd() * h;
        const n = 4 + Math.floor(rnd() * 4);
        const s = w * (0.008 + rnd() * 0.03);
        const pts: [number, number][] = [];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rnd() * 0.6;
          pts.push([Math.cos(a) * s * (0.6 + rnd() * 0.5), Math.sin(a) * s * (0.6 + rnd() * 0.5)]);
        }
        chips.push({ x, y, pts, col: cols[Math.floor(rnd() * cols.length)] });
      }
      wrapped(ctx, w, h, () => {
        for (const ch of chips) poly(ctx, ch.pts.map(([px, py]) => [px + ch.x, py + ch.y]), ch.col);
      });
    },
  },
  {
    id: 'plaid',
    name: 'Plaid',
    group: 'organic',
    tile: true,
    aspect: 1,
    draw(ctx, w, h, c) {
      bg(ctx, w, h, c[0]);
      const bands: [number, number, string, number][] = [
        [0.0, 0.22, c[1], 0.55],
        [0.3, 0.06, c[2], 0.7],
        [0.45, 0.02, c[3], 0.9],
        [0.6, 0.18, c[2], 0.45],
        [0.86, 0.04, c[1], 0.8],
      ];
      for (const [o, t, col, a] of bands) {
        ctx.globalAlpha = a;
        ctx.fillStyle = col;
        ctx.fillRect(0, o * h, w, t * h);
        ctx.fillRect(o * w, 0, t * w, h);
      }
      ctx.globalAlpha = 1;
    },
  },
  {
    id: 'brick',
    name: 'Subway brick',
    group: 'geometric',
    tile: true,
    aspect: 1,
    draw(ctx, w, h, c, rnd) {
      bg(ctx, w, h, c[3]);
      const rows = 8;
      const rh = h / rows;
      const bw = w / 2;
      const g = rh * 0.08;
      for (let r = 0; r < rows; r++)
        for (let i = -1; i <= 2; i++) {
          ctx.fillStyle = shade(c[1], (rnd() - 0.5) * 0.18);
          ctx.fillRect(i * bw + (r % 2) * (bw / 2) + g, r * rh + g, bw - 2 * g, rh - 2 * g);
        }
    },
  },
  {
    id: 'pinstripe',
    name: 'Privacy bands',
    group: 'glass',
    tile: true,
    aspect: 1,
    draw(ctx, w, h, c) {
      bg(ctx, w, h, c[0]);
      const stripes: [number, number][] = [
        [0.04, 0.012],
        [0.1, 0.04],
        [0.2, 0.012],
        [0.26, 0.09],
        [0.42, 0.012],
        [0.5, 0.04],
        [0.62, 0.012],
        [0.7, 0.12],
        [0.9, 0.02],
      ];
      ctx.fillStyle = c[1];
      for (const [o, t] of stripes) ctx.fillRect(0, o * h, w, t * h);
    },
  },
  {
    id: 'privacy-dots',
    name: 'Gradient dot screen',
    group: 'glass',
    tile: false,
    aspect: 1,
    draw(ctx, w, h, c) {
      bg(ctx, w, h, c[0]);
      const n = 40;
      const p = w / n;
      ctx.fillStyle = c[1];
      for (let j = 0; j < n; j++) {
        const t = j / (n - 1);
        const r = p * 0.48 * Math.max(0, 1 - Math.pow(t, 0.8) * 1.15);
        if (r < 0.4) continue;
        for (let i = 0; i < n; i++) {
          ctx.beginPath();
          ctx.arc(i * p + p / 2 + (j % 2) * (p / 2), j * p + p / 2, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },
  {
    id: 'reeded',
    name: 'Reeded glass lines',
    group: 'glass',
    tile: true,
    aspect: 1,
    draw(ctx, w, h, c) {
      const n = 16;
      const p = w / n;
      for (let i = 0; i < n; i++) {
        const g = ctx.createLinearGradient(i * p, 0, (i + 1) * p, 0);
        g.addColorStop(0, shade(c[0], -0.12));
        g.addColorStop(0.45, c[0]);
        g.addColorStop(0.55, shade(c[0], 0.5));
        g.addColorStop(1, shade(c[0], -0.18));
        ctx.fillStyle = g;
        ctx.fillRect(i * p, 0, p, h);
      }
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = c[1];
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    },
  },
];

export function patternById(id: string): PatternDef | undefined {
  return PATTERNS.find((p) => p.id === id);
}

export function normalizePalette(colors: readonly string[]): Palette {
  const ok = (v: string | undefined, fallback: string) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback);
  const d = COLOURWAYS[0].colors;
  return [ok(colors[0], d[0]), ok(colors[1], d[1]), ok(colors[2], d[2]), ok(colors[3], d[3])];
}

/** Stable key for a generated pattern, so identical settings reuse one texture. */
export function patternKey(id: string, colors: Palette): string {
  return `pattern:${id}:${colors.map((c) => c.slice(1)).join('-')}`;
}

/** Name of the matching preset colourway, or "Custom colours". */
export function colourwayName(colors: Palette): string {
  return COLOURWAYS.find((w) => w.colors.every((c, i) => c.toLowerCase() === colors[i]))?.name ?? 'Custom colours';
}

export function parsePatternKey(key: string): { id: string; colors: Palette } | null {
  const m = /^pattern:([a-z0-9-]+):([0-9a-f]{6})-([0-9a-f]{6})-([0-9a-f]{6})-([0-9a-f]{6})$/i.exec(key);
  if (!m || !patternById(m[1])) return null;
  return { id: m[1], colors: [`#${m[2]}`, `#${m[3]}`, `#${m[4]}`, `#${m[5]}`].map((c) => c.toLowerCase()) as Palette };
}

/** Draws a pattern into a new canvas (`size` = width in pixels). */
export function renderPattern(def: PatternDef, colors: Palette, size: number): HTMLCanvasElement {
  const w = Math.round(size);
  const h = Math.max(1, Math.round(size / def.aspect));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  let seed = 0;
  for (const ch of def.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  def.draw(ctx, w, h, colors, seededRandom(seed));
  return canvas;
}
