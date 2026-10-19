import type { TileLayout } from '../catalog/types';
import type { Quad } from '../geometry/homography';
import type { Placement } from '../geometry/placement';
import type { Point } from '../geometry/polygon';

/** Per-area adjustments layered on top of the selected material's defaults. */
export interface Appearance {
  /** added to the material brightness (-1..1) */
  brightness: number;
  /** multiplies the material saturation (0..2) */
  saturation: number;
  /** multiplies the material opacity (0.1..1) */
  opacity: number;
  /** replaces the material's room-light blend when set (0..1) */
  shading: number | null;
  /** replaces the material's tile/block density when set */
  gridDensity: number | null;
  /** replaces the material's tile layout when set */
  tileLayout: TileLayout | null;
  /** replaces the material's tile proportion when set */
  tileAspect: number | null;
}

export interface PrintArea {
  id: string;
  name: string;
  /** Visible print outline (any simple polygon, concave allowed). Normalized image coordinates. */
  boundary: Point[];
  /** Obstacle cutouts that stay unprinted. */
  exclusions: Point[][];
  /** Perspective frame TL, TR, BR, BL — independent from the outline. */
  perspective: Quad;
  /** Real-world width/height of the perspective frame (visual estimate, adjustable). */
  surfaceAspect: number;
  /** `library:<id>` or `upload:<id>` */
  artworkKey: string | null;
  materialId: string | null;
  placement: Placement;
  /** False until artwork is first applied, so the first artwork is fitted automatically. */
  placementInitialized: boolean;
  appearance: Appearance;
  /** Hidden areas keep their settings but are not printed in the preview. */
  hidden?: boolean;
}

/** Geometry and settings for one room photo. Kept per scene so switching rooms never mixes geometry. */
export interface SceneDoc {
  key: string;
  /** image width / height of the working photo */
  aspect: number;
  areas: PrintArea[];
  past: PrintArea[][];
  future: PrintArea[][];
  nextNumber: number;
}

export type EditMode = 'shape' | 'cutouts' | 'perspective' | 'artwork' | 'material';

export type HandleRef =
  | { kind: 'boundary'; index: number }
  | { kind: 'cutout'; cutout: number; index: number }
  | { kind: 'perspective'; index: number };

export type ShapeTarget = 'area' | 'cutout';

/**
 * Active stage tool. `none` is the select/edit tool; `draw` is the pen (point-by-point outline).
 */
export type Tool =
  | { kind: 'none' }
  | { kind: 'draw'; target: ShapeTarget; points: Point[] }
  | { kind: 'rect'; target: ShapeTarget }
  | { kind: 'magic'; target: ShapeTarget }
  | { kind: 'hand' };

export type ToolKind = Tool['kind'];

export interface Lighting {
  /** exposure in stops (-1..1) */
  exposure: number;
  /** -1 cool .. 1 warm */
  warmth: number;
}

export interface Notice {
  id: number;
  tone: 'info' | 'error';
  text: string;
}

export interface EditorState {
  sceneKey: string | null;
  docs: Record<string, SceneDoc>;
  selectedAreaId: string | null;
  mode: EditMode;
  tool: Tool;
  selectedHandle: HandleRef | null;
  lighting: Lighting;
  notice: Notice | null;
  idCounter: number;
  /** Snap points to photo corners/edges and other points while drawing and dragging. */
  snap: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  brightness: 0,
  saturation: 1,
  opacity: 1,
  shading: null,
  gridDensity: null,
  tileLayout: null,
  tileAspect: null,
};

export const DEFAULT_PLACEMENT: Placement = {
  scale: 1,
  offsetX: 0.5,
  offsetY: 0.5,
  rotation: 0,
  repeat: false,
};

export const DEFAULT_LIGHTING: Lighting = { exposure: 0, warmth: 0 };
