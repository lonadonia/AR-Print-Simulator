import type { Point } from '../geometry/polygon';

/** What a category groups. Matches the `contentType` field of the Wix categories collection. */
export type CategoryKind = 'room' | 'artwork' | 'material';

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  order: number;
}

/** Optional ready-made print area for a sample room (staff never have to supply these). */
export interface PresetArea {
  name: string;
  boundary: Point[];
  exclusions: Point[][];
  perspective: [Point, Point, Point, Point] | null;
  surfaceAspect: number | null;
  artworkId: string | null;
  materialId: string | null;
}

export interface SceneItem {
  id: string;
  title: string;
  categoryId: string | null;
  imageUrl: string;
  thumbnailUrl: string | null;
  description: string;
  order: number;
  presets: PresetArea[];
}

export interface ArtworkItem {
  id: string;
  title: string;
  categoryId: string | null;
  imageUrl: string;
  thumbnailUrl: string | null;
  order: number;
}

export type TextureKind = 'none' | 'brushed' | 'frosted' | 'tile-grid' | 'glass-block';

export const TEXTURE_KINDS: readonly TextureKind[] = ['none', 'brushed', 'frosted', 'tile-grid', 'glass-block'];

/** How tiles are laid when the texture is `tile-grid`. */
export type TileLayout = 'grid' | 'brick' | 'third' | 'herringbone' | 'hexagon' | 'diamond';

export const TILE_LAYOUTS: readonly TileLayout[] = ['grid', 'brick', 'third', 'herringbone', 'hexagon', 'diamond'];

/** Preview parameters a staff member can set per material. All are visual approximations. */
export interface MaterialParams {
  /** 0..1 — below 1 lets the photographed surface show through (e.g. clear glass) */
  opacity: number;
  /** 0..1 — strength of a soft sheen band */
  gloss: number;
  /** 0..1 — how much of the photo's light and shadow is kept on the print */
  shading: number;
  /** 0..2 — colour saturation multiplier */
  saturation: number;
  /** -1..1 — exposure shift in stops (×0.8) */
  brightness: number;
  /** #rrggbb multiply tint, e.g. a bronze metal or green glass edge */
  tint: string;
  /** 0..1 */
  tintStrength: number;
  texture: TextureKind;
  /** 0..1 */
  textureStrength: number;
  /** tiles/blocks across the frame height for tile-grid and glass-block textures */
  gridDensity: number;
  /** #rrggbb grout/mortar line colour */
  groutColor: string;
  /** tile arrangement for `tile-grid` */
  tileLayout: TileLayout;
  /** tile width / height for grid, brick and third-offset layouts (e.g. 3 for a 3:1 subway tile) */
  tileAspect: number;
}

export interface MaterialItem {
  id: string;
  name: string;
  categoryId: string | null;
  thumbnailUrl: string | null;
  description: string;
  order: number;
  params: MaterialParams;
}

export interface Theme {
  accent?: string;
  accentText?: string;
  fontFamily?: string;
  radius?: number;
}

export type CatalogSource = 'wix' | 'demo';

/** Optional editor features the Wix page can switch off (both on by default). */
export interface Features {
  patternMaker: boolean;
  camera: boolean;
}

export interface Catalog {
  source: CatalogSource;
  features: Features;
  categories: Category[];
  scenes: SceneItem[];
  artwork: ArtworkItem[];
  materials: MaterialItem[];
  theme: Theme | null;
}

export const DEFAULT_MATERIAL_PARAMS: MaterialParams = {
  opacity: 1,
  gloss: 0.2,
  shading: 0.55,
  saturation: 1,
  brightness: 0,
  tint: '#ffffff',
  tintStrength: 0,
  texture: 'none',
  textureStrength: 0.5,
  gridDensity: 6,
  groutColor: '#d9d6cf',
  tileLayout: 'grid',
  tileAspect: 1,
};
