import { readHeader, SUPPORTED_TYPES, type SniffedType } from './imageHeader';

/**
 * Loading, validation and browser-side resizing of room photos and artwork.
 *
 * Customer uploads are processed entirely in this browser tab: nothing is sent to a server.
 * Every image is drawn into a <canvas> at a bounded working size, which also bakes in the photo's
 * EXIF orientation (modern browsers apply it when decoding <img> elements).
 */

export type ImagePurpose = 'room' | 'artwork';

export const IMAGE_LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxMegapixels: 60,
  minSide: 200,
  maxEdge: { room: 2560, artwork: 2048 } as Record<ImagePurpose, number>,
  remoteTimeoutMs: 30_000,
} as const;

export const ACCEPT_ATTRIBUTE = 'image/jpeg,image/png,image/webp';
export const SUPPORTED_FORMATS_LABEL = 'JPEG, PNG or WebP, up to 25 MB';

export type ImageErrorCode =
  | 'too-large-file'
  | 'empty-file'
  | 'unsupported-type'
  | 'active-content'
  | 'heic'
  | 'too-many-pixels'
  | 'too-small'
  | 'corrupt'
  | 'network'
  | 'cross-origin'
  | 'timeout'
  | 'blocked-url'
  | 'aborted';

export class ImageLoadError extends Error {
  readonly code: ImageErrorCode;
  constructor(code: ImageErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'ImageLoadError';
  }
}

export interface LoadedImage {
  /** Working-size bitmap (orientation applied). */
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Dimensions of the original decoded image. */
  sourceWidth: number;
  sourceHeight: number;
  /** Mean luminance grid used for the "room light" shading of prints; null if unavailable. */
  luminance: LuminanceGrid | null;
}

export interface LuminanceGrid {
  cols: number;
  rows: number;
  values: Float32Array;
}

const TYPE_NAMES: Record<SniffedType, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  webp: 'WebP',
  gif: 'GIF',
  heic: 'HEIC/HEIF',
  avif: 'AVIF',
  svg: 'SVG/HTML',
  bmp: 'BMP',
  tiff: 'TIFF',
  unknown: 'unknown',
};

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Validates the file's size and content type before decoding. Exported for tests. */
export function precheck(fileSize: number, header: Uint8Array): { width: number | null; height: number | null } {
  if (fileSize === 0) throw new ImageLoadError('empty-file', 'This file is empty.');
  if (fileSize > IMAGE_LIMITS.maxFileBytes) {
    throw new ImageLoadError('too-large-file', `This file is ${formatMb(fileSize)}. The limit is ${formatMb(IMAGE_LIMITS.maxFileBytes)}.`);
  }
  const info = readHeader(header);
  if (info.type === 'svg') {
    throw new ImageLoadError('active-content', 'SVG and HTML files are not accepted. Please export the image as JPEG, PNG or WebP.');
  }
  if (info.type === 'heic') {
    throw new ImageLoadError(
      'heic',
      'HEIC photos are not supported in every browser. Please share or export the photo as JPEG (on iPhone: Settings › Camera › Formats › Most Compatible).',
    );
  }
  if (!SUPPORTED_TYPES.includes(info.type)) {
    throw new ImageLoadError(
      'unsupported-type',
      info.type === 'unknown'
        ? 'This file is not a supported image. Please use JPEG, PNG or WebP.'
        : `${TYPE_NAMES[info.type]} images are not supported. Please use JPEG, PNG or WebP.`,
    );
  }
  if (info.width !== null && info.height !== null) {
    checkDimensions(info.width, info.height);
  }
  return { width: info.width, height: info.height };
}

function checkDimensions(width: number, height: number): void {
  if (width <= 0 || height <= 0) throw new ImageLoadError('corrupt', 'The image could not be read. It may be damaged.');
  const mp = (width * height) / 1e6;
  if (mp > IMAGE_LIMITS.maxMegapixels) {
    throw new ImageLoadError(
      'too-many-pixels',
      `This image is ${Math.round(mp)} megapixels (${width}×${height}). The limit is ${IMAGE_LIMITS.maxMegapixels} megapixels.`,
    );
  }
  if (Math.min(width, height) < IMAGE_LIMITS.minSide) {
    throw new ImageLoadError('too-small', `This image is only ${width}×${height} pixels. Please use one at least ${IMAGE_LIMITS.minSide} pixels on each side.`);
  }
}

/** Working size that keeps the aspect ratio within the purpose limit and the GPU texture limit. */
export function workingSize(width: number, height: number, purpose: ImagePurpose, maxTextureSize = 4096): { width: number; height: number } {
  const maxEdge = Math.min(IMAGE_LIMITS.maxEdge[purpose], maxTextureSize);
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function drawToCanvas(img: HTMLImageElement, purpose: ImagePurpose, maxTextureSize: number): HTMLCanvasElement {
  const { width, height } = workingSize(img.naturalWidth, img.naturalHeight, purpose, maxTextureSize);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageLoadError('corrupt', 'The browser could not prepare this image (out of memory?).');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

export function computeLuminanceGrid(canvas: HTMLCanvasElement, cols = 64): LuminanceGrid | null {
  try {
    const rows = Math.max(1, Math.round((cols * canvas.height) / canvas.width));
    const small = document.createElement('canvas');
    small.width = cols;
    small.height = rows;
    const ctx = small.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0, cols, rows);
    const data = ctx.getImageData(0, 0, cols, rows).data;
    const values = new Float32Array(cols * rows);
    for (let i = 0; i < values.length; i++) {
      const r = data[i * 4] / 255;
      const g = data[i * 4 + 1] / 255;
      const b = data[i * 4 + 2] / 255;
      values[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    return { cols, rows, values };
  } catch {
    return null; // tainted canvas or out of memory: shading falls back to a neutral reference
  }
}

function decodeImage(src: string, crossOrigin: boolean, timeoutMs: number, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      fn();
    };
    const onAbort = () => finish(() => reject(new ImageLoadError('aborted', 'Loading was cancelled.')));
    const timer = window.setTimeout(
      () => finish(() => reject(new ImageLoadError('timeout', 'The image took too long to load. Check the connection and try again.'))),
      timeoutMs,
    );
    signal?.addEventListener('abort', onAbort);
    img.onload = () => {
      img
        .decode()
        .catch(() => undefined) // onload already guarantees a decodable image in all target browsers
        .then(() => finish(() => resolve(img)));
    };
    img.onerror = () =>
      finish(() =>
        reject(
          crossOrigin
            ? new ImageLoadError('network', 'The image could not be loaded. It may be missing, or the server does not allow it to be used here.')
            : new ImageLoadError('corrupt', 'The image could not be read. It may be damaged or in an unsupported format.'),
        ),
      );
    img.src = src;
  });
}

/** Reads, validates and resizes a customer's local file. */
export async function loadLocalImage(file: File, purpose: ImagePurpose, maxTextureSize: number): Promise<LoadedImage> {
  const header = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
  precheck(file.size, header);
  const url = URL.createObjectURL(file);
  try {
    const img = await decodeImage(url, false, IMAGE_LIMITS.remoteTimeoutMs);
    checkDimensions(img.naturalWidth, img.naturalHeight);
    const canvas = drawToCanvas(img, purpose, maxTextureSize);
    return {
      canvas,
      width: canvas.width,
      height: canvas.height,
      sourceWidth: img.naturalWidth,
      sourceHeight: img.naturalHeight,
      luminance: purpose === 'room' ? computeLuminanceGrid(canvas) : null,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Loads a catalog image (already validated as an allowed HTTPS or same-origin URL). */
export async function loadRemoteImage(url: string, purpose: ImagePurpose, maxTextureSize: number, signal?: AbortSignal): Promise<LoadedImage> {
  const sameOrigin = new URL(url, window.location.href).origin === window.location.origin;
  const img = await decodeImage(url, !sameOrigin, IMAGE_LIMITS.remoteTimeoutMs, signal);
  if (img.naturalWidth * img.naturalHeight > IMAGE_LIMITS.maxMegapixels * 1e6) {
    throw new ImageLoadError('too-many-pixels', 'This library image is larger than the editor can safely handle.');
  }
  const canvas = drawToCanvas(img, purpose, maxTextureSize);
  // WebGL can only use images the server allows cross-origin use of; detect that up front.
  try {
    canvas.getContext('2d')?.getImageData(0, 0, 1, 1);
  } catch {
    throw new ImageLoadError('cross-origin', 'The image server does not allow this image to be used in the preview (missing CORS permission).');
  }
  return {
    canvas,
    width: canvas.width,
    height: canvas.height,
    sourceWidth: img.naturalWidth,
    sourceHeight: img.naturalHeight,
    luminance: purpose === 'room' ? computeLuminanceGrid(canvas) : null,
  };
}

/**
 * Builds a working image from any drawable source (camera frame, generated pattern canvas),
 * applying the same size limits as uploads.
 */
export function imageFromSource(source: CanvasImageSource, width: number, height: number, purpose: ImagePurpose, maxTextureSize: number): LoadedImage {
  if (!(width > 0 && height > 0)) throw new ImageLoadError('corrupt', 'The image is empty.');
  const size = workingSize(width, height, purpose, maxTextureSize);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageLoadError('corrupt', 'The browser could not prepare this image (out of memory?).');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, size.width, size.height);
  return {
    canvas,
    width: size.width,
    height: size.height,
    sourceWidth: width,
    sourceHeight: height,
    luminance: purpose === 'room' ? computeLuminanceGrid(canvas) : null,
  };
}

/** Mean luminance of the grid cells whose centres fall inside `contains`. */
export function meanLuminance(grid: LuminanceGrid | null, contains: (x: number, y: number) => boolean): number {
  if (!grid) return 0.6;
  let sum = 0;
  let count = 0;
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (contains((c + 0.5) / grid.cols, (r + 0.5) / grid.rows)) {
        sum += grid.values[r * grid.cols + c];
        count++;
      }
    }
  }
  return count > 0 ? Math.max(0.05, sum / count) : 0.6;
}
