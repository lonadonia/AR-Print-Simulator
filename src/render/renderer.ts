import type { MaterialParams, TextureKind } from '../catalog/types';
import type { Mat3 } from '../geometry/homography';
import { polygonBounds, type Point } from '../geometry/polygon';
import { BACKGROUND_FS, POSITION_VS, PRINT_FS, STENCIL_FS } from './shaders';

/**
 * WebGL preview renderer.
 *
 * For every print area:
 *  1. the outline is rasterised into stencil bit 0 with INVERT (even-odd fill, so concave and
 *     L-shaped outlines work without triangulation);
 *  2. each cutout is rasterised into bit 1 and then used to clear both bits, so obstacles stay
 *     unprinted;
 *  3. one quad covering the outline runs the print shader, which maps every pixel back through
 *     the inverse homography to artwork coordinates. Because the mapping is evaluated per pixel
 *     there are no mesh seams.
 */

export interface TextureSource {
  key: string;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface RenderArea {
  id: string;
  boundary: readonly Point[];
  exclusions: readonly (readonly Point[])[];
  imgToSurf: Mat3;
  imgToArt: Mat3;
  art: TextureSource;
  repeat: boolean;
  surfaceAspect: number;
  material: MaterialParams;
  meanLuminance: number;
  /** On-screen height of the perspective frame in device pixels (pattern anti-aliasing). */
  frameHeightPx: number;
}

export interface RenderFrame {
  photo: TextureSource | null;
  exposure: number;
  warmth: number;
  areas: RenderArea[];
}

type GL = WebGLRenderingContext | WebGL2RenderingContext;

interface ProgramInfo {
  program: WebGLProgram;
  aPos: number;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

interface TextureEntry {
  texture: WebGLTexture;
  source: HTMLCanvasElement;
}

const TEXTURE_CODES: Record<TextureKind, number> = {
  none: 0,
  brushed: 1,
  frosted: 2,
  'tile-grid': 3,
  'glass-block': 4,
};

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  antialias: true,
  depth: false,
  stencil: true,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  powerPreference: 'default',
};

function isPowerOfTwo(n: number): boolean {
  return (n & (n - 1)) === 0;
}

function nextPowerOfTwo(n: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(1, n)));
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

/** Row-major Mat3 → column-major Float32Array for uniformMatrix3fv. */
function columnMajor(m: Mat3): Float32Array {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

export type ContextListener = (state: 'lost' | 'restored') => void;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private gl: GL;
  private readonly isWebGL2: boolean;
  private programs!: { background: ProgramInfo; stencil: ProgramInfo; print: ProgramInfo };
  private buffer!: WebGLBuffer;
  private textures = new Map<string, TextureEntry>();
  private anisotropy: { ext: EXT_texture_filter_anisotropic; max: number } | null = null;
  private lost = false;
  private listeners = new Set<ContextListener>();
  maxTextureSize = 4096;

  private constructor(canvas: HTMLCanvasElement, gl: GL, isWebGL2: boolean) {
    this.canvas = canvas;
    this.gl = gl;
    this.isWebGL2 = isWebGL2;
    this.init();
    canvas.addEventListener('webglcontextlost', this.onLost, false);
    canvas.addEventListener('webglcontextrestored', this.onRestored, false);
  }

  /** Returns null when WebGL (with a stencil buffer) is not available in this browser. */
  static create(canvas: HTMLCanvasElement): Renderer | null {
    const gl2 = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES) as WebGL2RenderingContext | null;
    if (gl2) return Renderer.tryInit(canvas, gl2, true);
    const gl1 = (canvas.getContext('webgl', CONTEXT_ATTRIBUTES) ??
      canvas.getContext('experimental-webgl', CONTEXT_ATTRIBUTES)) as WebGLRenderingContext | null;
    if (gl1) return Renderer.tryInit(canvas, gl1, false);
    return null;
  }

  private static tryInit(canvas: HTMLCanvasElement, gl: GL, isWebGL2: boolean): Renderer | null {
    const attrs = gl.getContextAttributes();
    if (!attrs?.stencil) return null;
    try {
      return new Renderer(canvas, gl, isWebGL2);
    } catch (err) {
      console.error('[visualizer] WebGL initialisation failed', err);
      return null;
    }
  }

  get contextLost(): boolean {
    return this.lost;
  }

  addContextListener(listener: ContextListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Test hook: simulate GPU context loss / restore (WEBGL_lose_context). */
  debugLoseContext(): { restore(): void } | null {
    const ext = this.gl.getExtension('WEBGL_lose_context');
    if (!ext) return null;
    ext.loseContext();
    return { restore: () => ext.restoreContext() };
  }

  private onLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    this.textures.clear();
    this.listeners.forEach((l) => l('lost'));
  };

  private onRestored = () => {
    try {
      this.init();
      this.lost = false;
      this.listeners.forEach((l) => l('restored'));
    } catch (err) {
      console.error('[visualizer] WebGL restore failed', err);
    }
  };

  private init(): void {
    const gl = this.gl;
    this.maxTextureSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, 8192);
    this.programs = {
      background: this.createProgram(POSITION_VS, BACKGROUND_FS, ['uPhoto', 'uExposure', 'uWarmth']),
      stencil: this.createProgram(POSITION_VS, STENCIL_FS, []),
      print: this.createProgram(POSITION_VS, PRINT_FS, [
        'uArt',
        'uPhoto',
        'uImgToSurf',
        'uImgToArt',
        'uResolution',
        'uRepeat',
        'uSurfAspect',
        'uOpacity',
        'uGloss',
        'uShading',
        'uMeanLum',
        'uSaturation',
        'uBrightness',
        'uTint',
        'uTintStrength',
        'uTexture',
        'uTexStrength',
        'uGridDensity',
        'uGroutColor',
        'uPatternAA',
        'uBrushFreq',
        'uExposure',
        'uWarmth',
      ]),
    };
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('Could not create vertex buffer');
    this.buffer = buffer;
    const ext =
      gl.getExtension('EXT_texture_filter_anisotropic') ??
      gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') ??
      gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
    this.anisotropy = ext ? { ext, max: Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number) } : null;
  }

  private createProgram(vsSource: string, fsSource: string, uniformNames: string[]): ProgramInfo {
    const gl = this.gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Could not create shader');
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compile failed: ${log}`);
      }
      return shader;
    };
    const program = gl.createProgram();
    if (!program) throw new Error('Could not create program');
    const vs = compile(gl.VERTEX_SHADER, vsSource);
    const fs = compile(gl.FRAGMENT_SHADER, fsSource);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, 'aPos');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    const uniforms: ProgramInfo['uniforms'] = {};
    for (const name of uniformNames) uniforms[name] = gl.getUniformLocation(program, name);
    return { program, aPos: 0, uniforms };
  }

  /** Sizes the drawing buffer; `cssWidth/cssHeight` is the displayed photo size. */
  resize(cssWidth: number, cssHeight: number, dpr: number): { width: number; height: number } {
    const limit = Math.min(this.maxTextureSize, 4096);
    let w = Math.max(1, Math.round(cssWidth * dpr));
    let h = Math.max(1, Math.round(cssHeight * dpr));
    const scale = Math.min(1, limit / Math.max(w, h));
    w = Math.max(1, Math.floor(w * scale));
    h = Math.max(1, Math.floor(h * scale));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    return { width: w, height: h };
  }

  private texture(source: TextureSource, kind: 'photo' | 'art'): WebGLTexture | null {
    const gl = this.gl;
    const existing = this.textures.get(source.key);
    if (existing && existing.source === source.canvas) return existing.texture;
    if (existing) gl.deleteTexture(existing.texture);

    let pixels: HTMLCanvasElement = source.canvas;
    const pot = isPowerOfTwo(pixels.width) && isPowerOfTwo(pixels.height);
    const mipmaps = this.isWebGL2 || pot || kind === 'art';
    if (!this.isWebGL2 && kind === 'art' && !pot) {
      // WebGL 1 needs power-of-two textures for REPEAT and mipmaps: resample the artwork.
      const c = document.createElement('canvas');
      c.width = Math.min(nextPowerOfTwo(pixels.width), 2048);
      c.height = Math.min(nextPowerOfTwo(pixels.height), 2048);
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(pixels, 0, 0, c.width, c.height);
      pixels = c;
    }

    const texture = gl.createTexture();
    if (!texture) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const wrap = kind === 'art' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (mipmaps && (this.isWebGL2 || (isPowerOfTwo(pixels.width) && isPowerOfTwo(pixels.height)))) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    if (this.anisotropy && kind === 'art') {
      gl.texParameterf(gl.TEXTURE_2D, this.anisotropy.ext.TEXTURE_MAX_ANISOTROPY_EXT, this.anisotropy.max);
    }
    this.textures.set(source.key, { texture, source: source.canvas });
    return texture;
  }

  /** Frees GPU memory for textures whose keys are not in `keep`. */
  pruneTextures(keep: ReadonlySet<string>): void {
    for (const [key, entry] of this.textures) {
      if (!keep.has(key)) {
        this.gl.deleteTexture(entry.texture);
        this.textures.delete(key);
      }
    }
  }

  private drawPolygon(points: readonly Point[], mode: number): void {
    const gl = this.gl;
    const data = new Float32Array(points.length * 2);
    points.forEach((p, i) => {
      data[i * 2] = p.x;
      data[i * 2 + 1] = p.y;
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(mode, 0, points.length);
  }

  private drawRect(minX: number, minY: number, maxX: number, maxY: number): void {
    this.drawPolygon(
      [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ],
      this.gl.TRIANGLE_FAN,
    );
  }

  render(frame: RenderFrame): void {
    const gl = this.gl;
    if (this.lost || gl.isContextLost()) return;
    const { width, height } = this.canvas;
    gl.viewport(0, 0, width, height);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.BLEND);
    gl.colorMask(true, true, true, true);
    gl.clearColor(0.93, 0.92, 0.9, 1);
    gl.stencilMask(0xff);
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    if (!frame.photo) return;

    const photoTex = this.texture(frame.photo, 'photo');
    if (!photoTex) return;

    // 1. Background photo with scene lighting.
    const bg = this.programs.background;
    gl.useProgram(bg.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, photoTex);
    gl.uniform1i(bg.uniforms.uPhoto, 0);
    gl.uniform1f(bg.uniforms.uExposure, frame.exposure);
    gl.uniform1f(bg.uniforms.uWarmth, frame.warmth);
    this.drawRect(0, 0, 1, 1);

    // 2. Print areas, in list order (later areas are drawn on top where they overlap).
    gl.enable(gl.STENCIL_TEST);
    for (const area of frame.areas) {
      const artTex = this.texture(area.art, 'art');
      if (!artTex) continue;

      gl.stencilMask(0xff);
      gl.clear(gl.STENCIL_BUFFER_BIT);
      gl.colorMask(false, false, false, false);
      gl.useProgram(this.programs.stencil.program);

      gl.stencilFunc(gl.ALWAYS, 0, 0xff);
      gl.stencilMask(0x01);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
      this.drawPolygon(area.boundary, gl.TRIANGLE_FAN);

      for (const cutout of area.exclusions) {
        if (cutout.length < 3) continue;
        gl.stencilMask(0x02);
        gl.stencilFunc(gl.ALWAYS, 0, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
        this.drawPolygon(cutout, gl.TRIANGLE_FAN);
        gl.stencilMask(0xff);
        gl.stencilFunc(gl.EQUAL, 0x02, 0x02);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.ZERO);
        this.drawPolygon(cutout, gl.TRIANGLE_FAN);
      }

      gl.colorMask(true, true, true, true);
      gl.stencilMask(0x00);
      gl.stencilFunc(gl.EQUAL, 0x01, 0x01);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);

      const p = this.programs.print;
      const u = p.uniforms;
      const m = area.material;
      gl.useProgram(p.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, artTex);
      gl.uniform1i(u.uArt, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, photoTex);
      gl.uniform1i(u.uPhoto, 1);
      gl.uniformMatrix3fv(u.uImgToSurf, false, columnMajor(area.imgToSurf));
      gl.uniformMatrix3fv(u.uImgToArt, false, columnMajor(area.imgToArt));
      gl.uniform2f(u.uResolution, width, height);
      gl.uniform1f(u.uRepeat, area.repeat ? 1 : 0);
      gl.uniform1f(u.uSurfAspect, area.surfaceAspect);
      gl.uniform1f(u.uOpacity, m.opacity);
      gl.uniform1f(u.uGloss, m.gloss);
      gl.uniform1f(u.uShading, m.shading);
      gl.uniform1f(u.uMeanLum, area.meanLuminance);
      gl.uniform1f(u.uSaturation, m.saturation);
      gl.uniform1f(u.uBrightness, m.brightness);
      gl.uniform3fv(u.uTint, hexToRgb(m.tint));
      gl.uniform1f(u.uTintStrength, m.tintStrength);
      gl.uniform1i(u.uTexture, TEXTURE_CODES[m.texture]);
      gl.uniform1f(u.uTexStrength, m.textureStrength);
      gl.uniform1f(u.uGridDensity, m.gridDensity);
      gl.uniform3fv(u.uGroutColor, hexToRgb(m.groutColor));
      const cellPx = area.frameHeightPx / Math.max(1, m.gridDensity);
      gl.uniform1f(u.uPatternAA, Math.min(0.25, Math.max(0.004, 1.5 / Math.max(cellPx, 1))));
      gl.uniform1f(u.uBrushFreq, Math.min(1400, Math.max(30, area.frameHeightPx / 2.2)));
      gl.uniform1f(u.uExposure, frame.exposure);
      gl.uniform1f(u.uWarmth, frame.warmth);

      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const b = polygonBounds(area.boundary);
      const pad = 2 / Math.max(width, height);
      this.drawRect(b.minX - pad, b.minY - pad, b.maxX + pad, b.maxY + pad);
      gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0);
    }
    gl.disable(gl.STENCIL_TEST);
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    if (!this.gl.isContextLost()) {
      for (const entry of this.textures.values()) this.gl.deleteTexture(entry.texture);
    }
    this.textures.clear();
    this.listeners.clear();
  }
}
