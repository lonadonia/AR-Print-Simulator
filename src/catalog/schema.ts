import type { Point } from '../geometry/polygon';
import {
  DEFAULT_MATERIAL_PARAMS,
  TEXTURE_KINDS,
  type ArtworkItem,
  type Catalog,
  type CatalogSource,
  type Category,
  type CategoryKind,
  type MaterialItem,
  type MaterialParams,
  type PresetArea,
  type SceneItem,
  type TextureKind,
  type Theme,
} from './types';

/**
 * Validates catalog data received from the Wix page (or the bundled demo fixtures).
 * Anything that is not well-formed is dropped and reported, never trusted or executed.
 */

export interface RejectedItem {
  collection: 'categories' | 'scenes' | 'artwork' | 'materials' | 'catalog';
  id: string | null;
  reason: string;
}

export interface ParseOptions {
  source: CatalogSource;
  /** Hostnames allowed for images. Entries starting with "." also allow subdomains. */
  allowedImageHosts: readonly string[];
  /** Allow same-origin relative URLs (bundled demo assets only). */
  allowRelativeUrls: boolean;
  /** Base URL used to resolve relative URLs. */
  baseUrl: string;
}

export interface ParseResult {
  catalog: Catalog;
  rejected: RejectedItem[];
}

export const MAX_ITEMS_PER_COLLECTION = 2000;

type Rec = Record<string, unknown>;

function isRecord(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  // Strip control characters; the UI renders text as plain text only.
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function color(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : fallback;
}

export function hostAllowed(hostname: string, allowed: readonly string[]): boolean {
  const h = hostname.toLowerCase();
  return allowed.some((entry) => {
    const e = entry.trim().toLowerCase();
    if (!e) return false;
    if (e.startsWith('.')) return h.endsWith(e) && h.length > e.length;
    return h === e;
  });
}

/** Returns a safe absolute URL string or null. */
export function safeImageUrl(v: unknown, opts: Pick<ParseOptions, 'allowedImageHosts' | 'allowRelativeUrls' | 'baseUrl'>): string | null {
  if (typeof v !== 'string') return null;
  const raw = v.trim();
  if (!raw || raw.length > 2048) return null;
  const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//');
  let url: URL;
  try {
    url = new URL(raw, opts.baseUrl);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (!isAbsolute) {
    if (!opts.allowRelativeUrls) return null;
    const base = new URL(opts.baseUrl);
    if (url.origin !== base.origin) return null;
    return url.href;
  }
  // Plain http is accepted only for a local development harness that is explicitly allow-listed.
  const localDev = url.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
  if (url.protocol !== 'https:' && !localDev) return null;
  if (!hostAllowed(url.hostname, opts.allowedImageHosts)) return null;
  return url.href;
}

function point(v: unknown): Point | null {
  if (!isRecord(v)) return null;
  const x = typeof v.x === 'number' ? v.x : NaN;
  const y = typeof v.y === 'number' ? v.y : NaN;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

function pointList(v: unknown, min: number, max: number): Point[] | null {
  if (!Array.isArray(v) || v.length < min || v.length > max) return null;
  const pts = v.map(point);
  return pts.every((p): p is Point => p !== null) ? pts : null;
}

function presets(v: unknown): PresetArea[] {
  if (!Array.isArray(v)) return [];
  const out: PresetArea[] = [];
  for (const raw of v.slice(0, 12)) {
    if (!isRecord(raw)) continue;
    const boundary = pointList(raw.boundary, 3, 64);
    if (!boundary) continue;
    const exclusions = Array.isArray(raw.exclusions)
      ? raw.exclusions
          .slice(0, 16)
          .map((e) => pointList(e, 3, 64))
          .filter((e): e is Point[] => e !== null)
      : [];
    const persp = pointList(raw.perspective, 4, 4);
    out.push({
      name: str(raw.name, 60) ?? `Area ${out.length + 1}`,
      boundary,
      exclusions,
      perspective: persp ? (persp as [Point, Point, Point, Point]) : null,
      surfaceAspect: raw.surfaceAspect === undefined ? null : num(raw.surfaceAspect, 1, 0.125, 8),
      artworkId: str(raw.artworkId, 100),
      materialId: str(raw.materialId, 100),
    });
  }
  return out;
}

function materialParams(v: unknown): MaterialParams {
  const r = isRecord(v) ? v : {};
  const d = DEFAULT_MATERIAL_PARAMS;
  const texture = typeof r.texture === 'string' && (TEXTURE_KINDS as readonly string[]).includes(r.texture) ? (r.texture as TextureKind) : d.texture;
  return {
    opacity: num(r.opacity, d.opacity, 0.05, 1),
    gloss: num(r.gloss, d.gloss, 0, 1),
    shading: num(r.shading, d.shading, 0, 1),
    saturation: num(r.saturation, d.saturation, 0, 2),
    brightness: num(r.brightness, d.brightness, -1, 1),
    tint: color(r.tint, d.tint),
    tintStrength: num(r.tintStrength, d.tintStrength, 0, 1),
    texture,
    textureStrength: num(r.textureStrength, d.textureStrength, 0, 1),
    gridDensity: num(r.gridDensity, d.gridDensity, 1, 40),
    groutColor: color(r.groutColor, d.groutColor),
  };
}

function theme(v: unknown): Theme | null {
  if (!isRecord(v)) return null;
  const t: Theme = {};
  if (typeof v.accent === 'string' && /^#[0-9a-f]{6}$/i.test(v.accent)) t.accent = v.accent.toLowerCase();
  if (typeof v.accentText === 'string' && /^#[0-9a-f]{6}$/i.test(v.accentText)) t.accentText = v.accentText.toLowerCase();
  if (typeof v.fontFamily === 'string' && /^[\w\s,'"-]{1,160}$/.test(v.fontFamily)) t.fontFamily = v.fontFamily;
  if (typeof v.radius === 'number' && Number.isFinite(v.radius)) t.radius = Math.min(24, Math.max(0, v.radius));
  return Object.keys(t).length ? t : null;
}

function byOrder<T extends { order: number }>(items: T[], label: (t: T) => string): T[] {
  return items.sort((a, b) => a.order - b.order || label(a).localeCompare(label(b)));
}

export function parseCatalog(raw: unknown, opts: ParseOptions): ParseResult {
  const rejected: RejectedItem[] = [];
  const root = isRecord(raw) ? raw : null;
  if (!root) {
    rejected.push({ collection: 'catalog', id: null, reason: 'Catalog payload is not an object.' });
  }
  const list = (key: 'categories' | 'scenes' | 'artwork' | 'materials'): unknown[] => {
    const v = root?.[key];
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      rejected.push({ collection: key, id: null, reason: `"${key}" is not a list.` });
      return [];
    }
    if (v.length > MAX_ITEMS_PER_COLLECTION) {
      rejected.push({ collection: key, id: null, reason: `Only the first ${MAX_ITEMS_PER_COLLECTION} items were used.` });
    }
    return v.slice(0, MAX_ITEMS_PER_COLLECTION);
  };

  const seen = new Set<string>();
  const uniqueId = (collection: RejectedItem['collection'], v: unknown): string | null => {
    const id = str(v, 100);
    if (!id) {
      rejected.push({ collection, id: null, reason: 'Missing id.' });
      return null;
    }
    const key = `${collection}:${id}`;
    if (seen.has(key)) {
      rejected.push({ collection, id, reason: 'Duplicate id.' });
      return null;
    }
    seen.add(key);
    return id;
  };

  const categories: Category[] = [];
  for (const r of list('categories')) {
    if (!isRecord(r)) continue;
    const id = uniqueId('categories', r.id);
    if (!id) continue;
    const name = str(r.name, 60);
    const kind = r.kind === 'room' || r.kind === 'artwork' || r.kind === 'material' ? (r.kind as CategoryKind) : null;
    if (!name || !kind) {
      rejected.push({ collection: 'categories', id, reason: 'Category needs a name and a content type (room, artwork or material).' });
      continue;
    }
    categories.push({ id, name, kind, order: num(r.order, 0, -1e6, 1e6) });
  }
  const categoryIds = (kind: CategoryKind) => new Set(categories.filter((c) => c.kind === kind).map((c) => c.id));
  const roomCats = categoryIds('room');
  const artCats = categoryIds('artwork');
  const matCats = categoryIds('material');
  const catRef = (v: unknown, valid: Set<string>) => {
    const id = str(v, 100);
    return id && valid.has(id) ? id : null;
  };

  const scenes: SceneItem[] = [];
  for (const r of list('scenes')) {
    if (!isRecord(r)) continue;
    const id = uniqueId('scenes', r.id);
    if (!id) continue;
    const imageUrl = safeImageUrl(r.imageUrl, opts);
    if (!imageUrl) {
      rejected.push({ collection: 'scenes', id, reason: 'Image URL is missing or not from an allowed HTTPS host.' });
      continue;
    }
    scenes.push({
      id,
      title: str(r.title, 120) ?? 'Untitled room',
      categoryId: catRef(r.categoryId, roomCats),
      imageUrl,
      thumbnailUrl: safeImageUrl(r.thumbnailUrl, opts),
      description: str(r.description, 300) ?? '',
      order: num(r.order, 0, -1e6, 1e6),
      presets: presets(r.presets),
    });
  }

  const artwork: ArtworkItem[] = [];
  for (const r of list('artwork')) {
    if (!isRecord(r)) continue;
    const id = uniqueId('artwork', r.id);
    if (!id) continue;
    const imageUrl = safeImageUrl(r.imageUrl, opts);
    if (!imageUrl) {
      rejected.push({ collection: 'artwork', id, reason: 'Image URL is missing or not from an allowed HTTPS host.' });
      continue;
    }
    artwork.push({
      id,
      title: str(r.title, 120) ?? 'Untitled artwork',
      categoryId: catRef(r.categoryId, artCats),
      imageUrl,
      thumbnailUrl: safeImageUrl(r.thumbnailUrl, opts),
      order: num(r.order, 0, -1e6, 1e6),
    });
  }

  const materials: MaterialItem[] = [];
  for (const r of list('materials')) {
    if (!isRecord(r)) continue;
    const id = uniqueId('materials', r.id);
    if (!id) continue;
    const name = str(r.name, 80);
    if (!name) {
      rejected.push({ collection: 'materials', id, reason: 'Material needs a name.' });
      continue;
    }
    materials.push({
      id,
      name,
      categoryId: catRef(r.categoryId, matCats),
      thumbnailUrl: safeImageUrl(r.thumbnailUrl, opts),
      description: str(r.description, 300) ?? '',
      order: num(r.order, 0, -1e6, 1e6),
      params: materialParams(r.params),
    });
  }

  return {
    catalog: {
      source: opts.source,
      categories: byOrder(categories, (c) => c.name),
      scenes: byOrder(scenes, (s) => s.title),
      artwork: byOrder(artwork, (a) => a.title),
      materials: byOrder(materials, (m) => m.name),
      theme: theme(root?.theme),
    },
    rejected,
  };
}
