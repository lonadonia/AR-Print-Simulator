/**
 * Additional DEMO artwork for the bundled sample library (see generate-demo-assets.mjs).
 * All designs are generated from code: SVG filters/shapes, or the app's own Pattern Maker.
 * They are placeholders that show the range of surfaces a UV printer can produce, not the
 * client's catalogue.
 */

const W = 1600;
const H = 1000;
const r1 = (n) => Math.round(n * 10) / 10;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const svg = (inner, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${inner}</svg>`;

/** Thin vein network from a noise iso-band, coloured `rgb` (0..1 values). */
const veinFilter = (id, freq, seed, band, rgb, blur, octaves = 6) => {
  const n = 21;
  const table = Array.from({ length: n }, (_, i) => (Math.abs(i - Math.floor(n / 2)) <= band ? 0.95 : 0)).join(' ');
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0"/><feComponentTransfer><feFuncA type="table" tableValues="${table}"/></feComponentTransfer><feGaussianBlur stdDeviation="${blur}"/><feColorMatrix type="matrix" values="0 0 0 0 ${rgb[0]}  0 0 0 0 ${rgb[1]}  0 0 0 0 ${rgb[2]}  0 0 0 1 0"/></filter>`;
};

/** Smooth colour field from noise: maps noise value t to mix(lo, hi). */
const fieldFilter = (id, freq, seed, lo, hi, octaves = 4, bands = 0) => {
  const m = [0, 1, 2].map((k) => `${(hi[k] - lo[k]).toFixed(3)} 0 0 0 ${lo[k].toFixed(3)}`);
  const banding = bands
    ? `<feComponentTransfer><feFuncR type="discrete" tableValues="${Array.from({ length: bands }, (_, i) => (i / (bands - 1)).toFixed(3)).join(' ')}"/></feComponentTransfer><feGaussianBlur stdDeviation="2.2"/>`
    : '';
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}"/>${banding}<feColorMatrix type="matrix" values="${m[0]}  ${m[1]}  ${m[2]}  0 0 0 0 1"/></filter>`;
};

export const EXTRA_SVG = {
  // ---------------------------------------------------------------- marble & stone
  calacatta: () =>
    svg(
      `<rect width="100%" height="100%" fill="#f6f3ed"/><rect width="100%" height="100%" filter="url(#c1)" opacity=".55"/><rect width="100%" height="100%" filter="url(#c2)"/><rect width="100%" height="100%" filter="url(#c3)"/>`,
      fieldFilter('c1', '0.0016 0.0035', 31, [0.93, 0.91, 0.88], [0.99, 0.98, 0.96]) +
        veinFilter('c2', '0.0024 0.0062', 8, 0, [0.66, 0.53, 0.3], 1.4, 6) +
        veinFilter('c3', '0.0034 0.009', 19, 0, [0.5, 0.49, 0.48], 0.6, 6),
    ),
  nero: () =>
    svg(
      `<rect width="100%" height="100%" fill="#151515"/><rect width="100%" height="100%" filter="url(#n1)" opacity=".5"/><rect width="100%" height="100%" filter="url(#n2)"/><rect width="100%" height="100%" filter="url(#n3)"/>`,
      fieldFilter('n1', '0.002 0.004', 4, [0.06, 0.06, 0.06], [0.2, 0.2, 0.21]) +
        veinFilter('n2', '0.0026 0.0068', 12, 0, [0.93, 0.92, 0.9], 0.7, 6) +
        veinFilter('n3', '0.0018 0.0052', 27, 0, [0.62, 0.61, 0.6], 1.3, 5),
    ),
  'emerald-onyx': () =>
    svg(`<rect width="100%" height="100%" filter="url(#e1)"/><rect width="100%" height="100%" filter="url(#e2)" opacity=".7"/>`, fieldFilter('e1', '0.0012 0.004', 9, [0.02, 0.18, 0.12], [0.55, 0.85, 0.66], 5, 9) + veinFilter('e2', '0.002 0.006', 41, 0, [0.85, 0.95, 0.88], 1.2, 5)),
  'amber-onyx': () =>
    svg(
      `<rect width="100%" height="100%" filter="url(#a1)"/><rect width="100%" height="100%" filter="url(#a2)" opacity=".6"/><rect width="100%" height="100%" fill="url(#glow)"/>`,
      fieldFilter('a1', '0.0011 0.0038', 14, [0.45, 0.2, 0.04], [1.0, 0.82, 0.48], 5, 10) +
        veinFilter('a2', '0.002 0.005', 52, 0, [1, 0.95, 0.85], 1.1, 5) +
        `<radialGradient id="glow" cx="50%" cy="45%" r="65%"><stop offset="0" stop-color="#fff6d8" stop-opacity=".45"/><stop offset="1" stop-color="#3a1800" stop-opacity=".25"/></radialGradient>`,
    ),
  travertine: () => {
    const r = rng(77);
    let pores = '';
    for (let i = 0; i < 900; i++) pores += `<ellipse cx="${r1(r() * W)}" cy="${r1(r() * H)}" rx="${r1(2 + r() * 9)}" ry="${r1(0.8 + r() * 2)}" fill="#8f7a5c" opacity="${(0.25 + r() * 0.35).toFixed(2)}"/>`;
    return svg(`<rect width="100%" height="100%" filter="url(#t1)"/>${pores}`, fieldFilter('t1', '0.0008 0.03', 3, [0.74, 0.66, 0.53], [0.93, 0.88, 0.79], 4, 8));
  },
  granite: () => {
    const r = rng(5);
    const cols = ['#1c1c1c', '#4a4a4a', '#8d8d8d', '#d6d2cc', '#6b5a4d'];
    let s = '';
    for (let i = 0; i < 9000; i++) s += `<circle cx="${r1(r() * W)}" cy="${r1(r() * H)}" r="${r1(1 + r() * 4.5)}" fill="${cols[Math.floor(r() * cols.length)]}"/>`;
    return svg(`<rect width="100%" height="100%" fill="#a7a39d"/>${s}`);
  },

  // ---------------------------------------------------------------- wood & natural
  oak: () => woodPlanks(['#c99d6b', '#b8885a', '#d9b384'], 21, 0.55),
  walnut: () => woodPlanks(['#5a3824', '#6d4429', '#4a2d1c'], 33, 0.7),
  bamboo: () => {
    const r = rng(9);
    let s = `<rect width="100%" height="100%" fill="#e7dcc0"/>`;
    for (let i = 0; i < 18; i++) {
      const x = i * 92 + r() * 20;
      const wdt = 44 + r() * 16;
      s += `<rect x="${r1(x)}" y="0" width="${r1(wdt)}" height="${H}" fill="url(#stalk)"/>`;
      for (let y = r() * 200; y < H; y += 170 + r() * 90) s += `<rect x="${r1(x - 2)}" y="${r1(y)}" width="${r1(wdt + 4)}" height="7" rx="3" fill="#7a8a3a" opacity=".85"/>`;
    }
    for (let i = 0; i < 26; i++) {
      const x = r() * W;
      const y = r() * H;
      const a = r() * 360;
      s += `<path transform="translate(${r1(x)},${r1(y)}) rotate(${r1(a)})" d="M0,0 C40,-12 110,-10 150,0 C110,10 40,12 0,0Z" fill="#5f7a2e" opacity=".85"/>`;
    }
    return svg(s, `<linearGradient id="stalk" x1="0" x2="1"><stop offset="0" stop-color="#8f9a46"/><stop offset=".45" stop-color="#c3c46e"/><stop offset="1" stop-color="#77843a"/></linearGradient>`);
  },

  // ---------------------------------------------------------------- nature & landscapes
  palms: () => {
    const r = rng(14);
    let s = `<rect width="100%" height="100%" fill="#f1ede1"/>`;
    const frond = (x, y, len, rot, col) => {
      let leaflets = '';
      const n = 22;
      for (let k = 2; k < n; k++) {
        const t = k / n;
        const px = t * len;
        const py = -Math.sin(t * Math.PI * 0.9) * len * 0.12;
        const l = len * 0.32 * Math.sin(t * Math.PI) + 12;
        for (const side of [-1, 1]) {
          const a = side * (52 - t * 18);
          leaflets += `<path transform="translate(${r1(px)},${r1(py)}) rotate(${r1(a)})" d="M0,0 C${r1(l * 0.3)},-6 ${r1(l * 0.75)},-5 ${r1(l)},0 C${r1(l * 0.75)},5 ${r1(l * 0.3)},6 0,0Z" fill="${col}"/>`;
        }
      }
      return `<g transform="translate(${r1(x)},${r1(y)}) rotate(${r1(rot)})"><path d="M0,0 Q${r1(len * 0.5)},${r1(-len * 0.16)} ${r1(len)},${r1(-len * 0.05)}" stroke="${col}" stroke-width="5" fill="none"/>${leaflets}</g>`;
    };
    const cols = ['#1f4d3a', '#2f6b4f', '#4f8a63', '#24533f', '#6f9e6e'];
    for (let i = 0; i < 18; i++) s += frond(r() * W, r() * H, 260 + r() * 240, r() * 360, cols[i % cols.length]);
    return svg(s);
  },
  mountains: () => {
    let s = `<rect width="100%" height="100%" fill="url(#sky)"/><circle cx="1120" cy="380" r="110" fill="#ffd8a8" opacity=".95"/>`;
    const layers = [
      ['#5b4b8a', 520, 0.9],
      ['#46397a', 610, 1.3],
      ['#2f2a5e', 700, 1.7],
      ['#1d1b3f', 800, 2.2],
    ];
    const r = rng(3);
    for (const [col, base, rough] of layers) {
      let d = `M0,${H} L0,${base}`;
      for (let x = 0; x <= W; x += 40) d += ` L${x},${r1(base - 120 * Math.abs(Math.sin(x / 260 + rough)) - r() * 30 * rough)}`;
      d += ` L${W},${H} Z`;
      s += `<path d="${d}" fill="${col}"/>`;
    }
    return svg(s, `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2f6b"/><stop offset=".55" stop-color="#d9738c"/><stop offset="1" stop-color="#f7c59f"/></linearGradient>`);
  },
  clouds: () => {
    const r = rng(23);
    let s = `<rect width="100%" height="100%" fill="url(#sky2)"/>`;
    for (let i = 0; i < 14; i++) {
      const cx = r() * W;
      const cy = 100 + r() * 800;
      let g = '';
      for (let k = 0; k < 7; k++) g += `<circle cx="${r1(cx + (k - 3) * 55 + r() * 30)}" cy="${r1(cy + Math.sin(k) * 25)}" r="${r1(50 + r() * 50)}" fill="#fff"/>`;
      s += `<g filter="url(#soft)" opacity="${(0.7 + r() * 0.3).toFixed(2)}">${g}</g>`;
    }
    return svg(s, `<linearGradient id="sky2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f8fd1"/><stop offset="1" stop-color="#bfe0f5"/></linearGradient><filter id="soft"><feGaussianBlur stdDeviation="14"/></filter>`);
  },

  // ---------------------------------------------------------------- abstract & art
  'fluid-ink': () => {
    let stripes = '';
    const cols = ['#0b2545', '#13315c', '#c9a227', '#eef4ed', '#134074', '#8da9c4'];
    for (let i = 0; i < 60; i++) stripes += `<rect x="-200" y="${i * 20 - 100}" width="${W + 400}" height="20" fill="${cols[(i * 7) % cols.length]}"/>`;
    return svg(
      `<g filter="url(#flow)">${stripes}</g>`,
      `<filter id="flow" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.0016 0.0024" numOctaves="3" seed="17" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="300" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="2.4"/></filter>`,
    );
  },
  watercolor: () => {
    const r = rng(41);
    const cols = ['#e07a5f', '#f2cc8f', '#81b29a', '#3d405b', '#f4a261', '#9d8189'];
    let s = `<rect width="100%" height="100%" fill="#fbf7ef"/>`;
    for (let i = 0; i < 40; i++)
      s += `<circle cx="${r1(r() * W)}" cy="${r1(r() * H)}" r="${r1(80 + r() * 220)}" fill="${cols[i % cols.length]}" opacity="${(0.12 + r() * 0.2).toFixed(2)}" filter="url(#wc)"/>`;
    return svg(s, `<filter id="wc" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="3" seed="2"/><feDisplacementMap in="SourceGraphic" scale="60"/><feGaussianBlur stdDeviation="6"/></filter>`);
  },
  ombre: () =>
    svg(
      `<rect width="100%" height="100%" fill="url(#om)"/><rect width="100%" height="100%" filter="url(#grain)" opacity=".08"/>`,
      `<linearGradient id="om" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d3557"/><stop offset=".45" stop-color="#457b9d"/><stop offset=".75" stop-color="#a8dadc"/><stop offset="1" stop-color="#f1faee"/></linearGradient><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".8"/><feColorMatrix type="saturate" values="0"/></filter>`,
    ),

  // ---------------------------------------------------------------- glass & privacy
  'frosted-leaves': () => {
    const r = rng(61);
    let s = `<rect width="100%" height="100%" fill="#cfd6d8"/>`;
    for (let i = 0; i < 40; i++) {
      const sc = 0.6 + r() * 1.4;
      s += `<g transform="translate(${r1(r() * W)},${r1(r() * H)}) rotate(${r1(r() * 360)}) scale(${sc.toFixed(2)})"><path d="M0,0 C30,-50 90,-35 110,0 C90,35 30,50 0,0Z" fill="#ffffff" opacity=".85"/><path d="M0,0 L104,0" stroke="#cfd6d8" stroke-width="3"/></g>`;
    }
    return svg(s);
  },
  'linear-fade': () => {
    let s = `<rect width="100%" height="100%" fill="#eef2f3"/>`;
    for (let y = 0; y < H; y += 14) {
      const t = y / H;
      s += `<rect x="0" y="${y}" width="${W}" height="${r1(9 * (1 - t) + 0.6)}" fill="#7d8f96" opacity="${(0.9 - t * 0.75).toFixed(2)}"/>`;
    }
    return svg(s);
  },

  // ---------------------------------------------------------------- kids
  'starry-night': () => {
    const r = rng(8);
    let s = `<rect width="100%" height="100%" fill="url(#night)"/>`;
    for (let i = 0; i < 160; i++) s += `<circle cx="${r1(r() * W)}" cy="${r1(r() * H)}" r="${r1(1 + r() * 2.5)}" fill="#fff6c9" opacity="${(0.5 + r() * 0.5).toFixed(2)}"/>`;
    for (let i = 0; i < 26; i++) {
      const x = r() * W;
      const y = r() * H;
      const k = 10 + r() * 16;
      s += `<path d="M${r1(x)},${r1(y - k)} Q${r1(x)},${r1(y)} ${r1(x + k)},${r1(y)} Q${r1(x)},${r1(y)} ${r1(x)},${r1(y + k)} Q${r1(x)},${r1(y)} ${r1(x - k)},${r1(y)} Q${r1(x)},${r1(y)} ${r1(x)},${r1(y - k)}Z" fill="#ffd166"/>`;
    }
    s += `<circle cx="1260" cy="230" r="120" fill="#fff1c1"/><circle cx="1310" cy="200" r="110" fill="#1d2b5c"/>`;
    return svg(s, `<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f1a3d"/><stop offset="1" stop-color="#2b3f7a"/></linearGradient>`);
  },
  'rainbow-arches': () => {
    const cols = ['#d1734b', '#e9b44c', '#9cb59a', '#e8c4b8', '#b4654a'];
    let s = `<rect width="100%" height="100%" fill="#f6efe4"/>`;
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 4; i++) {
        const cx = 200 + i * 400 + (row % 2) * 200;
        const cy = 330 + row * 330;
        for (let k = 5; k >= 1; k--) {
          s += `<path d="M${cx - k * 30},${cy} A${k * 30},${k * 30} 0 0 1 ${cx + k * 30},${cy}" fill="none" stroke="${cols[(k + i + row) % cols.length]}" stroke-width="24" stroke-linecap="round"/>`;
        }
      }
    return svg(s);
  },
  memphis: () => {
    const r = rng(12);
    const cols = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#1c1d20'];
    let s = `<rect width="100%" height="100%" fill="#fff7ec"/>`;
    for (let i = 0; i < 90; i++) {
      const x = r() * W;
      const y = r() * H;
      const c = cols[Math.floor(r() * cols.length)];
      const k = Math.floor(r() * 4);
      if (k === 0) s += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(12 + r() * 22)}" fill="${c}"/>`;
      else if (k === 1) s += `<path d="M${r1(x)},${r1(y)} l40,-60 l40,60z" fill="none" stroke="${c}" stroke-width="8" transform="rotate(${r1(r() * 360)} ${r1(x)} ${r1(y)})"/>`;
      else if (k === 2) s += `<path d="M${r1(x)},${r1(y)} q20,-30 40,0 t40,0 t40,0" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round"/>`;
      else s += `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(18 + r() * 30)}" height="${r1(18 + r() * 30)}" fill="${c}" transform="rotate(${r1(r() * 90)} ${r1(x)} ${r1(y)})"/>`;
    }
    return svg(s);
  },
};

function woodPlanks(tones, seed, grainOpacity) {
  const r = rng(seed);
  const rows = 8;
  const rh = H / rows;
  let s = '';
  for (let j = 0; j < rows; j++) {
    let x = -r() * 600;
    while (x < W) {
      const len = 500 + r() * 700;
      s += `<rect x="${r1(x)}" y="${r1(j * rh)}" width="${r1(len)}" height="${r1(rh)}" fill="${tones[Math.floor(r() * tones.length)]}"/>`;
      s += `<line x1="${r1(x)}" y1="${r1(j * rh)}" x2="${r1(x)}" y2="${r1((j + 1) * rh)}" stroke="#2b1a0e" stroke-opacity=".35" stroke-width="2"/>`;
      x += len;
    }
    s += `<line x1="0" y1="${r1(j * rh)}" x2="${W}" y2="${r1(j * rh)}" stroke="#2b1a0e" stroke-opacity=".4" stroke-width="2"/>`;
  }
  return svg(
    `${s}<rect width="100%" height="100%" filter="url(#grain)" opacity="${grainOpacity}"/>`,
    `<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.0025 0.09" numOctaves="4" seed="${seed}"/><feColorMatrix type="matrix" values="0 0 0 0 0.18  0 0 0 0 0.1  0 0 0 0 0.04  -1.6 0 0 0 1.05"/></filter>`,
  );
}

/** Library entries rendered with the Pattern Maker (pattern id, colourway colours, tiles across). */
export const PATTERN_LIBRARY = {
  'zellige-emerald': ['zellige', ['#e9ede6', '#1f6f5c', '#0f3d33', '#ffffff'], 7],
  'encaustic-blue': ['encaustic', ['#f4f1ea', '#2e4bc6', '#9fb3d9', '#f2b705'], 4],
  'moroccan-lantern': ['quatrefoil', ['#f5efe0', '#c8553d', '#8c3b2a', '#f2a07b'], 4],
  'islamic-star': ['star8', ['#f4efe6', '#1f6f78', '#0b3954', '#c9a227'], 4],
  'fish-scale': ['fishscale', ['#f7e7e3', '#d8a7a0', '#6b6e70', '#ffffff'], 4],
  'herringbone-marble': ['herringbone', ['#f1efea', '#e4e1da', '#c9c4ba', '#a9a49a'], 3],
  'cubes-terracotta': ['cubes', ['#f2e3d5', '#c8553d', '#8c3b2a', '#f2a07b'], 5],
  'chevron-navy': ['chevron', ['#14213d', '#c9a227', '#1d3461', '#e5e5e5'], 4],
  'dot-screen': ['privacy-dots', ['#ffffff', '#5e6b70', '#5e6b70', '#5e6b70'], 1],
};
