/**
 * GLSL ES 1.00 shaders (valid in WebGL 1 and WebGL 2 contexts).
 *
 * Geometry vertices are given in normalized image coordinates (0..1, y down) and the canvas always
 * covers exactly the displayed photo, so gl_FragCoord maps directly back to image coordinates.
 */

const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

export const POSITION_VS = `
attribute vec2 aPos;
varying vec2 vImg;
void main() {
  vImg = aPos;
  gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0);
}
`;

const SCENE_LIGHT = `
uniform float uExposure;   // stops
uniform float uWarmth;     // -1 cool .. 1 warm
vec3 sceneLight(vec3 c) {
  c *= pow(2.0, uExposure);
  c *= vec3(1.0 + 0.10 * uWarmth, 1.0 + 0.015 * uWarmth, 1.0 - 0.13 * uWarmth);
  // soft shoulder instead of a hard clip when brightening
  return c / (1.0 + max(c - 1.0, 0.0));
}
`;

export const BACKGROUND_FS = `${PRECISION}
varying vec2 vImg;
uniform sampler2D uPhoto;
${SCENE_LIGHT}
void main() {
  vec3 c = texture2D(uPhoto, vImg).rgb;
  gl_FragColor = vec4(clamp(sceneLight(c), 0.0, 1.0), 1.0);
}
`;

export const STENCIL_FS = `${PRECISION}
void main() { gl_FragColor = vec4(0.0); }
`;

export const PRINT_FS = `${PRECISION}
varying vec2 vImg;
uniform sampler2D uArt;
uniform sampler2D uPhoto;
uniform mat3 uImgToSurf;
uniform mat3 uImgToArt;
uniform vec2 uResolution;
uniform float uRepeat;
uniform float uSurfAspect;
uniform float uOpacity;
uniform float uGloss;
uniform float uShading;
uniform float uMeanLum;
uniform float uSaturation;
uniform float uBrightness;
uniform vec3 uTint;
uniform float uTintStrength;
uniform int uTexture;        // 0 none, 1 brushed, 2 frosted, 3 tile grid, 4 glass block
uniform float uTexStrength;
uniform float uGridDensity;
uniform vec3 uGroutColor;
uniform float uPatternAA;    // anti-aliasing width for grid lines, in cell units
uniform float uBrushFreq;
uniform int uTileLayout;     // 0 grid, 1 brick (1/2 offset), 2 third offset, 3 herringbone, 4 hexagon, 5 diamond
uniform float uTileAspect;   // tile width / height for grid, brick and third-offset layouts
${SCENE_LIGHT}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise1(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash(vec2(i, 1.7)), hash(vec2(i + 1.0, 1.7)), u);
}

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Tile layouts. p is measured in tile heights (or tile short sides for herringbone). Returns the
// distance to the nearest joint in the same units, the position inside the tile (0..1) and a
// per-tile random value.
float rectTile(vec2 q, float a, out vec2 local, out float id) {
  vec2 f = fract(q);
  local = f;
  id = hash(floor(q) + 0.37);
  return min(min(f.x, 1.0 - f.x) * a, min(f.y, 1.0 - f.y));
}

float tileLayout(vec2 p, int layout, float aspect, out vec2 local, out float id) {
  float a = max(aspect, 0.05);
  if (layout == 1 || layout == 2) {
    float row = floor(p.y);
    float shift = layout == 1 ? 0.5 * mod(row, 2.0) : mod(row, 3.0) / 3.0;
    return rectTile(vec2(p.x / a + shift, p.y), a, local, id);
  }
  if (layout == 5) {
    vec2 q = vec2(p.x + p.y, p.y - p.x) * 0.70710678;
    return rectTile(q, 1.0, local, id);
  }
  if (layout == 4) {
    vec2 s = vec2(1.0, 1.7320508);
    vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
    vec4 hh = vec4(p - hc.xy * s, p - (hc.zw + 0.5) * s);
    bool first = dot(hh.xy, hh.xy) < dot(hh.zw, hh.zw);
    vec2 lp = first ? hh.xy : hh.zw;
    vec2 cid = first ? hc.xy : hc.zw + 0.5;
    vec2 ap = abs(lp);
    local = lp + 0.5;
    id = hash(cid + 0.37);
    return 0.5 - max(dot(ap, vec2(0.5, 0.8660254)), ap.x);
  }
  if (layout == 3) {
    // 2:1 herringbone laid at 45 degrees: diagonal bands of alternating horizontal/vertical tiles.
    vec2 q = vec2(p.x + p.y, p.y - p.x) * 0.70710678 * 2.0;
    float i = floor(q.x);
    float j = floor(q.y);
    float d = i - j;
    float b = floor(d / 4.0);
    float dd = d - 4.0 * b;
    vec2 lo;
    vec2 size;
    if (dd < 2.0) {
      lo = vec2(j + 4.0 * b, j);
      size = vec2(2.0, 1.0);
    } else {
      float t = i - 2.0 - 4.0 * b;
      lo = vec2(i, t - 1.0);
      size = vec2(1.0, 2.0);
    }
    vec2 r = q - lo;
    local = r / size;
    id = hash(lo + 0.37);
    return 0.5 * min(min(r.x, size.x - r.x), min(r.y, size.y - r.y));
  }
  return rectTile(vec2(p.x / a, p.y), a, local, id);
}

void main() {
  vec2 img = vec2(gl_FragCoord.x / uResolution.x, 1.0 - gl_FragCoord.y / uResolution.y);

  vec3 sh = uImgToSurf * vec3(img, 1.0);
  if (sh.z <= 0.0) discard;              // beyond the plane's vanishing line
  vec2 st = sh.xy / sh.z;                 // surface coordinates (0..1 across the perspective frame)

  vec3 ah = uImgToArt * vec3(img, 1.0);
  vec2 uv = ah.xy / ah.z;                 // artwork coordinates

  // Tile / glass-block cells in surface units (tile height = 1 / density of the frame height).
  vec2 cell = vec2(st.x * uSurfAspect, st.y) * uGridDensity;
  vec2 cf;
  float tileId;
  int layout = uTexture == 4 ? 0 : uTileLayout;
  float edgeDist = tileLayout(cell, layout, uTexture == 4 ? 1.0 : uTileAspect, cf, tileId);

  if (uTexture == 4) {
    // glass block: each block slightly magnifies what is behind its centre
    vec2 local = cf - 0.5;
    uv -= local * (0.035 * uTexStrength) / max(uGridDensity, 1.0);
  }

  if (uRepeat < 0.5 && (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0)) discard;

  vec4 art = texture2D(uArt, uv);
  vec3 c = art.rgb;
  float alpha = art.a * uOpacity;

  vec3 photo = texture2D(uPhoto, img).rgb;
  float L = luma(photo);

  // Base adjustments: saturation, exposure, tint.
  c = mix(vec3(luma(c)), c, uSaturation);
  c *= pow(2.0, uBrightness * 0.8);
  c = mix(c, c * uTint, uTintStrength);

  // Material textures (visual approximations only).
  if (uTexture == 1) {
    float n = noise1(st.y * uBrushFreq + noise1(st.x * 3.0) * 6.0);
    float n2 = noise1(st.y * uBrushFreq * 2.7 + 11.0);
    c *= 1.0 + ((n * 0.7 + n2 * 0.3) - 0.5) * 0.16 * uTexStrength;
    c = mix(c, vec3(luma(c)) * vec3(0.96, 0.98, 1.02), 0.18 * uTexStrength);
  } else if (uTexture == 2) {
    c = mix(c, vec3(1.0), 0.24 * uTexStrength);
    c = mix(vec3(luma(c)), c, 1.0 - 0.3 * uTexStrength);
    c += (hash(gl_FragCoord.xy) - 0.5) * 0.035 * uTexStrength;
  } else if (uTexture == 3 || uTexture == 4) {
    float w = uTexture == 3 ? 0.035 : 0.06;
    float line = 1.0 - smoothstep(w, w + uPatternAA, edgeDist);
    float bevel = 1.0 - smoothstep(w, w * 3.0 + uPatternAA, edgeDist);
    c *= 1.0 - 0.07 * bevel * uTexStrength;
    if (uTexture == 3) c *= 1.0 + (tileId - 0.5) * 0.05 * uTexStrength;   // slight per-tile glaze variation
    if (uTexture == 4) {
      vec2 local = cf - 0.5;
      c *= 1.0 - 0.18 * dot(local, local) * uTexStrength;        // darker towards block edges
      c += 0.06 * uTexStrength * (1.0 - smoothstep(0.0, 0.35, length(local - vec2(-0.12, -0.12))));
    }
    vec3 grout = uGroutColor * (0.55 + 0.45 * clamp(L / max(uMeanLum, 0.05), 0.4, 1.4));
    c = mix(c, grout, line * uTexStrength);
    alpha = mix(alpha, max(alpha, 0.95), line * uTexStrength);
  }

  // Keep the photo's own light and shadow on the print.
  float ratio = clamp(L / max(uMeanLum, 0.05), 0.35, 1.6);
  c *= mix(1.0, ratio, uShading);

  // Restrained sheen: two soft diagonal bands in surface space.
  float d1 = (st.x * 0.62 + st.y * 0.38 - 0.32) / 0.14;
  float d2 = (st.x * 0.62 + st.y * 0.38 - 0.62) / 0.06;
  float b1 = exp(-d1 * d1);
  float b2 = exp(-d2 * d2);
  c += uGloss * (0.22 * b1 + 0.08 * b2) * (0.55 + 0.45 * L);

  c = sceneLight(max(c, 0.0));
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
}
`;
