import { DEFAULT_MATERIAL_PARAMS, type MaterialItem, type MaterialParams } from '../catalog/types';
import { validateQuad, type QuadIssue } from '../geometry/homography';
import { validatePolygon, type PolygonIssue } from '../geometry/polygon';
import type { Appearance, EditorState, PrintArea, SceneDoc } from './types';

export function selectDoc(state: EditorState): SceneDoc | null {
  return state.sceneKey ? (state.docs[state.sceneKey] ?? null) : null;
}

export function selectArea(state: EditorState): PrintArea | null {
  const doc = selectDoc(state);
  return doc?.areas.find((a) => a.id === state.selectedAreaId) ?? null;
}

export interface AreaValidity {
  boundary: PolygonIssue | null;
  cutouts: (PolygonIssue | null)[];
  perspective: QuadIssue | null;
  /** True when the area can be rendered with artwork. */
  renderable: boolean;
}

export function areaValidity(area: PrintArea, aspect: number): AreaValidity {
  const boundary = validatePolygon(area.boundary, aspect);
  const cutouts = area.exclusions.map((c) => validatePolygon(c, aspect));
  const perspective = validateQuad(area.perspective, aspect);
  return { boundary, cutouts, perspective, renderable: !boundary && !perspective };
}

/** Material defaults combined with the area's own appearance adjustments. */
export function effectiveMaterial(material: MaterialItem | null, appearance: Appearance): MaterialParams {
  const base = material?.params ?? DEFAULT_MATERIAL_PARAMS;
  return {
    ...base,
    brightness: Math.min(1.5, Math.max(-1.5, base.brightness + appearance.brightness)),
    saturation: Math.min(2, Math.max(0, base.saturation * appearance.saturation)),
    opacity: Math.min(1, Math.max(0.05, base.opacity * appearance.opacity)),
    shading: appearance.shading ?? base.shading,
    gridDensity: appearance.gridDensity ?? base.gridDensity,
  };
}
