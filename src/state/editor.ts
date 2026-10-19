import { estimateSurfaceAspect, orderQuadCorners, quadFromBounds, validateQuad, quadIssueMessage, type Quad } from '../geometry/homography';
import { clampOffset, clampScale, fitPlacement, projectionForQuad, type Placement } from '../geometry/placement';
import {
  clampPoint,
  insertMidpoint,
  polygonBounds,
  polygonIssueMessage,
  rectPolygon,
  removeVertex,
  validatePolygon,
  type Point,
} from '../geometry/polygon';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_LIGHTING,
  DEFAULT_PLACEMENT,
  type Appearance,
  type EditMode,
  type EditorState,
  type HandleRef,
  type Lighting,
  type PrintArea,
  type SceneDoc,
} from './types';

export const HISTORY_LIMIT = 60;

export type Action =
  | { type: 'open-scene'; key: string; aspect: number; presets?: PrintArea[] }
  | { type: 'forget-scene'; key: string }
  | { type: 'start-draw'; target: 'area' | 'cutout' }
  | { type: 'draw-add-point'; point: Point }
  | { type: 'draw-undo-point' }
  | { type: 'draw-cancel' }
  | { type: 'draw-finish' }
  | { type: 'add-rect-area' }
  | { type: 'add-rect-cutout' }
  | { type: 'select-area'; id: string | null }
  | { type: 'set-mode'; mode: EditMode }
  | { type: 'select-handle'; handle: HandleRef | null }
  | { type: 'checkpoint' }
  | { type: 'move-handle'; handle: HandleRef; point: Point }
  | { type: 'nudge-handle'; handle: HandleRef; dx: number; dy: number }
  | { type: 'insert-point'; target: 'boundary' | number; edgeIndex: number }
  | { type: 'remove-point'; handle: HandleRef }
  | { type: 'delete-area'; id: string }
  | { type: 'duplicate-area'; id: string }
  | { type: 'rename-area'; id: string; name: string }
  | { type: 'reorder-area'; id: string; direction: -1 | 1 }
  | { type: 'delete-cutout'; index: number }
  | { type: 'set-artwork'; key: string | null; artworkAspect: number | null }
  | { type: 'init-placement'; areaId: string; artworkAspect: number }
  | { type: 'clear-artwork-everywhere'; key: string }
  | { type: 'set-placement'; patch: Partial<Placement>; checkpoint?: boolean }
  | { type: 'fit-artwork'; mode: 'contain' | 'cover'; artworkAspect: number }
  | { type: 'set-material'; materialId: string | null }
  | { type: 'set-appearance'; patch: Partial<Appearance>; checkpoint?: boolean }
  | { type: 'reset-appearance' }
  | { type: 'reset-perspective' }
  | { type: 'set-surface-aspect'; value: number; checkpoint?: boolean }
  | { type: 'set-lighting'; patch: Partial<Lighting> }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'notify'; tone: 'info' | 'error'; text: string }
  | { type: 'clear-notice' };

export function initialState(): EditorState {
  return {
    sceneKey: null,
    docs: {},
    selectedAreaId: null,
    mode: 'shape',
    tool: { kind: 'none' },
    selectedHandle: null,
    lighting: { ...DEFAULT_LIGHTING },
    notice: null,
    idCounter: 1,
  };
}

/** Perspective frame that matches a new outline: its own corners if it has four, else its bounds. */
export function perspectiveForBoundary(boundary: readonly Point[], aspect: number): Quad {
  if (boundary.length === 4) {
    const q = orderQuadCorners(boundary);
    if (!validateQuad(q, aspect)) return q;
  }
  const b = polygonBounds(boundary);
  return quadFromBounds(b.minX, b.minY, b.maxX, b.maxY);
}

export function createArea(id: string, name: string, boundary: Point[], aspect: number, init?: Partial<PrintArea>): PrintArea {
  const perspective = init?.perspective && !validateQuad(init.perspective, aspect) ? init.perspective : perspectiveForBoundary(boundary, aspect);
  return {
    id,
    name,
    boundary,
    exclusions: init?.exclusions ?? [],
    perspective,
    surfaceAspect: init?.surfaceAspect ?? estimateSurfaceAspect(perspective, aspect),
    artworkKey: init?.artworkKey ?? null,
    materialId: init?.materialId ?? null,
    placement: init?.placement ?? { ...DEFAULT_PLACEMENT },
    placementInitialized: init?.placementInitialized ?? false,
    appearance: init?.appearance ?? { ...DEFAULT_APPEARANCE },
  };
}

function notice(state: EditorState, tone: 'info' | 'error', text: string): EditorState {
  return { ...state, notice: { id: (state.notice?.id ?? 0) + 1, tone, text } };
}

function currentDoc(state: EditorState): SceneDoc | null {
  return state.sceneKey ? (state.docs[state.sceneKey] ?? null) : null;
}

function withDoc(state: EditorState, doc: SceneDoc): EditorState {
  return { ...state, docs: { ...state.docs, [doc.key]: doc } };
}

function pushHistory(doc: SceneDoc): SceneDoc {
  const past = [...doc.past, doc.areas];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { ...doc, past, future: [] };
}

/** Replaces the areas of the current doc, optionally recording an undo step. */
function setAreas(state: EditorState, areas: PrintArea[], record: boolean): EditorState {
  const doc = currentDoc(state);
  if (!doc) return state;
  const base = record ? pushHistory(doc) : doc;
  return withDoc(state, { ...base, areas });
}

function updateSelected(state: EditorState, fn: (a: PrintArea, doc: SceneDoc) => PrintArea | null, record: boolean): EditorState {
  const doc = currentDoc(state);
  if (!doc || !state.selectedAreaId) return state;
  const idx = doc.areas.findIndex((a) => a.id === state.selectedAreaId);
  if (idx < 0) return state;
  const next = fn(doc.areas[idx], doc);
  if (!next || next === doc.areas[idx]) return state;
  const areas = doc.areas.slice();
  areas[idx] = next;
  return setAreas(state, areas, record);
}

function nextId(state: EditorState): [string, EditorState] {
  return [`area-${state.idCounter}`, { ...state, idCounter: state.idCounter + 1 }];
}

function movedHandle(area: PrintArea, handle: HandleRef, point: Point, aspect: number): PrintArea | 'invalid-quad' | null {
  const p = clampPoint(point);
  if (handle.kind === 'boundary') {
    if (handle.index < 0 || handle.index >= area.boundary.length) return null;
    const boundary = area.boundary.slice();
    boundary[handle.index] = p;
    return { ...area, boundary };
  }
  if (handle.kind === 'cutout') {
    const cutout = area.exclusions[handle.cutout];
    if (!cutout || handle.index < 0 || handle.index >= cutout.length) return null;
    const exclusions = area.exclusions.slice();
    const pts = cutout.slice();
    pts[handle.index] = p;
    exclusions[handle.cutout] = pts;
    return { ...area, exclusions };
  }
  if (handle.index < 0 || handle.index > 3) return null;
  const perspective = area.perspective.slice() as Quad;
  perspective[handle.index] = p;
  // A folded or collapsed frame has no valid projection: refuse the move instead.
  if (validateQuad(perspective, aspect)) return 'invalid-quad';
  return { ...area, perspective };
}

export function editorReducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'open-scene': {
      const existing = state.docs[action.key];
      const doc: SceneDoc = existing ?? {
        key: action.key,
        aspect: action.aspect,
        areas: action.presets ?? [],
        past: [],
        future: [],
        nextNumber: (action.presets?.length ?? 0) + 1,
      };
      return {
        ...withDoc(state, doc),
        sceneKey: action.key,
        selectedAreaId: doc.areas[0]?.id ?? null,
        tool: { kind: 'none' },
        selectedHandle: null,
        mode: doc.areas[0]?.artworkKey ? 'artwork' : 'shape',
        idCounter: state.idCounter + (action.presets?.length ?? 0),
      };
    }

    case 'forget-scene': {
      if (!state.docs[action.key]) return state;
      const docs = { ...state.docs };
      delete docs[action.key];
      return { ...state, docs };
    }

    case 'start-draw': {
      const doc = currentDoc(state);
      if (!doc) return state;
      if (action.target === 'cutout' && !state.selectedAreaId) return notice(state, 'error', 'Select a print area before adding a cutout.');
      return {
        ...state,
        tool: { kind: 'draw', target: action.target, points: [] },
        selectedHandle: null,
        mode: action.target === 'cutout' ? 'cutouts' : 'shape',
      };
    }

    case 'draw-add-point': {
      if (state.tool.kind !== 'draw') return state;
      const points = [...state.tool.points, clampPoint(action.point)];
      if (points.length > 64) return notice(state, 'error', 'A shape can have at most 64 points.');
      return { ...state, tool: { ...state.tool, points } };
    }

    case 'draw-undo-point': {
      if (state.tool.kind !== 'draw') return state;
      return { ...state, tool: { ...state.tool, points: state.tool.points.slice(0, -1) } };
    }

    case 'draw-cancel':
      return state.tool.kind === 'draw' ? { ...state, tool: { kind: 'none' } } : state;

    case 'draw-finish': {
      const doc = currentDoc(state);
      if (!doc || state.tool.kind !== 'draw') return state;
      const pts = state.tool.points;
      const issue = validatePolygon(pts, doc.aspect);
      if (issue) return notice(state, 'error', polygonIssueMessage(issue));
      if (state.tool.target === 'area') {
        const [id, s1] = nextId(state);
        const area = createArea(id, `Area ${doc.nextNumber}`, pts, doc.aspect);
        const s2 = setAreas(s1, [...doc.areas, area], true);
        const d2 = currentDoc(s2)!;
        return {
          ...withDoc(s2, { ...d2, nextNumber: d2.nextNumber + 1 }),
          tool: { kind: 'none' },
          selectedAreaId: id,
          mode: 'shape',
          selectedHandle: null,
        };
      }
      const s3 = updateSelected(state, (a) => ({ ...a, exclusions: [...a.exclusions, pts] }), true);
      return { ...s3, tool: { kind: 'none' }, mode: 'cutouts', selectedHandle: null };
    }

    case 'add-rect-area': {
      const doc = currentDoc(state);
      if (!doc) return state;
      const [id, s1] = nextId(state);
      const h = 0.3;
      const w = Math.min(0.8, (0.3 * 1.4) / doc.aspect);
      const offset = (doc.areas.length % 4) * 0.04;
      const area = createArea(id, `Area ${doc.nextNumber}`, rectPolygon(0.5 + offset, 0.5 + offset, w, h), doc.aspect);
      const s2 = setAreas(s1, [...doc.areas, area], true);
      const d2 = currentDoc(s2)!;
      return {
        ...withDoc(s2, { ...d2, nextNumber: d2.nextNumber + 1 }),
        selectedAreaId: id,
        mode: 'shape',
        tool: { kind: 'none' },
        selectedHandle: null,
      };
    }

    case 'add-rect-cutout': {
      const doc = currentDoc(state);
      if (!doc || !state.selectedAreaId) return notice(state, 'error', 'Select a print area before adding a cutout.');
      const s = updateSelected(
        state,
        (a) => {
          const b = polygonBounds(a.boundary);
          const cx = (b.minX + b.maxX) / 2;
          const cy = (b.minY + b.maxY) / 2;
          const w = (b.maxX - b.minX) * 0.3;
          const h = (b.maxY - b.minY) * 0.4;
          return { ...a, exclusions: [...a.exclusions, rectPolygon(cx, cy, w, h)] };
        },
        true,
      );
      return { ...s, mode: 'cutouts', tool: { kind: 'none' }, selectedHandle: null };
    }

    case 'select-area': {
      if (action.id === state.selectedAreaId) return state;
      return { ...state, selectedAreaId: action.id, selectedHandle: null, tool: state.tool.kind === 'draw' && state.tool.target === 'area' ? state.tool : { kind: 'none' } };
    }

    case 'set-mode':
      return { ...state, mode: action.mode, selectedHandle: null, tool: { kind: 'none' } };

    case 'select-handle':
      return { ...state, selectedHandle: action.handle };

    case 'checkpoint': {
      const doc = currentDoc(state);
      return doc ? withDoc(state, pushHistory(doc)) : state;
    }

    case 'move-handle':
    case 'nudge-handle': {
      const doc = currentDoc(state);
      if (!doc) return state;
      let rejected = false;
      const s = updateSelected(
        state,
        (a) => {
          const h = action.handle;
          let to: Point;
          if (action.type === 'move-handle') {
            to = action.point;
          } else {
            const from =
              h.kind === 'boundary' ? a.boundary[h.index] : h.kind === 'cutout' ? a.exclusions[h.cutout]?.[h.index] : a.perspective[h.index];
            if (!from) return null;
            to = { x: from.x + action.dx, y: from.y + action.dy };
          }
          const r = movedHandle(a, h, to, doc.aspect);
          if (r === 'invalid-quad') {
            rejected = true;
            return null;
          }
          return r;
        },
        action.type === 'nudge-handle',
      );
      if (rejected && action.type === 'nudge-handle') return notice(state, 'error', quadIssueMessage('not-convex'));
      return { ...s, selectedHandle: action.handle };
    }

    case 'insert-point': {
      const s = updateSelected(
        state,
        (a) => {
          if (action.target === 'boundary') {
            if (a.boundary.length >= 64) return null;
            return { ...a, boundary: insertMidpoint(a.boundary, action.edgeIndex) };
          }
          const c = a.exclusions[action.target];
          if (!c || c.length >= 64) return null;
          const exclusions = a.exclusions.slice();
          exclusions[action.target] = insertMidpoint(c, action.edgeIndex);
          return { ...a, exclusions };
        },
        true,
      );
      if (s === state) return state;
      const handle: HandleRef =
        action.target === 'boundary' ? { kind: 'boundary', index: action.edgeIndex + 1 } : { kind: 'cutout', cutout: action.target, index: action.edgeIndex + 1 };
      return { ...s, selectedHandle: handle };
    }

    case 'remove-point': {
      const h = action.handle;
      if (h.kind === 'perspective') return state;
      let refused = false;
      const s = updateSelected(
        state,
        (a) => {
          if (h.kind === 'boundary') {
            const b = removeVertex(a.boundary, h.index);
            if (!b) {
              refused = true;
              return null;
            }
            return { ...a, boundary: b };
          }
          const c = a.exclusions[h.cutout];
          if (!c) return null;
          const next = removeVertex(c, h.index);
          if (!next) {
            refused = true;
            return null;
          }
          const exclusions = a.exclusions.slice();
          exclusions[h.cutout] = next;
          return { ...a, exclusions };
        },
        true,
      );
      if (refused) return notice(state, 'error', 'A shape needs at least three points. Delete the whole shape instead.');
      return { ...s, selectedHandle: null };
    }

    case 'delete-area': {
      const doc = currentDoc(state);
      if (!doc) return state;
      const idx = doc.areas.findIndex((a) => a.id === action.id);
      if (idx < 0) return state;
      const areas = doc.areas.filter((a) => a.id !== action.id);
      const s = setAreas(state, areas, true);
      const nextSel = state.selectedAreaId === action.id ? (areas[Math.min(idx, areas.length - 1)]?.id ?? null) : state.selectedAreaId;
      return { ...s, selectedAreaId: nextSel, selectedHandle: null };
    }

    case 'duplicate-area': {
      const doc = currentDoc(state);
      if (!doc) return state;
      const src = doc.areas.find((a) => a.id === action.id);
      if (!src) return state;
      const [id, s1] = nextId(state);
      const shift = (p: Point) => clampPoint({ x: p.x + 0.03, y: p.y + 0.03 });
      const copy: PrintArea = {
        ...structuredClone(src),
        id,
        name: `${src.name} copy`.slice(0, 60),
        boundary: src.boundary.map(shift),
        exclusions: src.exclusions.map((c) => c.map(shift)),
        perspective: src.perspective.map(shift) as Quad,
      };
      if (validateQuad(copy.perspective, doc.aspect)) copy.perspective = src.perspective;
      const s2 = setAreas(s1, [...doc.areas, copy], true);
      const d2 = currentDoc(s2)!;
      return { ...withDoc(s2, { ...d2, nextNumber: d2.nextNumber + 1 }), selectedAreaId: id, selectedHandle: null };
    }

    case 'rename-area': {
      const doc = currentDoc(state);
      if (!doc) return state;
      const name = action.name.replace(/\s+/g, ' ').slice(0, 60);
      return setAreas(
        state,
        doc.areas.map((a) => (a.id === action.id ? { ...a, name } : a)),
        false,
      );
    }

    case 'reorder-area': {
      const doc = currentDoc(state);
      if (!doc) return state;
      const i = doc.areas.findIndex((a) => a.id === action.id);
      const j = i + action.direction;
      if (i < 0 || j < 0 || j >= doc.areas.length) return state;
      const areas = doc.areas.slice();
      [areas[i], areas[j]] = [areas[j], areas[i]];
      return setAreas(state, areas, true);
    }

    case 'delete-cutout': {
      const s = updateSelected(
        state,
        (a) => (a.exclusions[action.index] ? { ...a, exclusions: a.exclusions.filter((_, i) => i !== action.index) } : null),
        true,
      );
      return { ...s, selectedHandle: null };
    }

    case 'set-artwork':
      return updateSelected(
        state,
        (a) => {
          if (a.artworkKey === action.key) return null;
          // A newly chosen design is fitted to cover the outline (keeping rotation and repeat).
          // If its proportions are not known yet (still loading), the fit happens on load.
          const next: PrintArea = { ...a, artworkKey: action.key, placementInitialized: false };
          if (action.key && action.artworkAspect) {
            const proj = projectionForQuad(a.perspective);
            const fitted = proj ? fitPlacement('cover', proj, a.boundary, a.surfaceAspect, action.artworkAspect, a.placement) : null;
            next.placement = fitted ?? a.placement;
            next.placementInitialized = true;
          }
          return next;
        },
        true,
      );

    case 'init-placement': {
      const doc = currentDoc(state);
      if (!doc) return state;
      const idx = doc.areas.findIndex((a) => a.id === action.areaId);
      const a = doc.areas[idx];
      if (!a || a.placementInitialized) return state;
      const proj = projectionForQuad(a.perspective);
      const fitted = proj ? fitPlacement('cover', proj, a.boundary, a.surfaceAspect, action.artworkAspect, a.placement) : null;
      const areas = doc.areas.slice();
      areas[idx] = { ...a, placement: fitted ?? a.placement, placementInitialized: true };
      return setAreas(state, areas, false);
    }

    case 'clear-artwork-everywhere': {
      const docs: Record<string, SceneDoc> = {};
      for (const [k, d] of Object.entries(state.docs)) {
        docs[k] = d.areas.some((a) => a.artworkKey === action.key)
          ? { ...d, areas: d.areas.map((a) => (a.artworkKey === action.key ? { ...a, artworkKey: null } : a)) }
          : d;
      }
      return { ...state, docs };
    }

    case 'set-placement':
      return updateSelected(
        state,
        (a) => {
          const p = { ...a.placement, ...action.patch };
          p.scale = clampScale(p.scale);
          p.offsetX = clampOffset(p.offsetX);
          p.offsetY = clampOffset(p.offsetY);
          p.rotation = ((p.rotation % 360) + 360) % 360;
          return { ...a, placement: p, placementInitialized: true };
        },
        action.checkpoint ?? false,
      );

    case 'fit-artwork': {
      const s = updateSelected(
        state,
        (a) => {
          const proj = projectionForQuad(a.perspective);
          const fitted = proj ? fitPlacement(action.mode, proj, a.boundary, a.surfaceAspect, action.artworkAspect, a.placement) : null;
          return fitted ? { ...a, placement: fitted, placementInitialized: true } : null;
        },
        true,
      );
      return s === state ? notice(state, 'error', 'Fix the outline and perspective frame first, then try again.') : s;
    }

    case 'set-material':
      return updateSelected(state, (a) => ({ ...a, materialId: action.materialId }), true);

    case 'set-appearance':
      return updateSelected(state, (a) => ({ ...a, appearance: { ...a.appearance, ...action.patch } }), action.checkpoint ?? false);

    case 'reset-appearance':
      return updateSelected(state, (a) => ({ ...a, appearance: { ...DEFAULT_APPEARANCE } }), true);

    case 'reset-perspective':
      return updateSelected(
        state,
        (a, doc) => {
          const perspective = perspectiveForBoundary(a.boundary, doc.aspect);
          return { ...a, perspective, surfaceAspect: estimateSurfaceAspect(perspective, doc.aspect) };
        },
        true,
      );

    case 'set-surface-aspect':
      return updateSelected(
        state,
        (a) => ({ ...a, surfaceAspect: Math.min(8, Math.max(0.125, action.value)) }),
        action.checkpoint ?? false,
      );

    case 'set-lighting':
      return {
        ...state,
        lighting: {
          exposure: Math.min(1, Math.max(-1, action.patch.exposure ?? state.lighting.exposure)),
          warmth: Math.min(1, Math.max(-1, action.patch.warmth ?? state.lighting.warmth)),
        },
      };

    case 'undo':
    case 'redo': {
      const doc = currentDoc(state);
      if (!doc) return state;
      const from = action.type === 'undo' ? doc.past : doc.future;
      if (from.length === 0) return state;
      const target = from[from.length - 1];
      const rest = from.slice(0, -1);
      const next: SceneDoc =
        action.type === 'undo'
          ? { ...doc, areas: target, past: rest, future: [...doc.future, doc.areas] }
          : { ...doc, areas: target, future: rest, past: [...doc.past, doc.areas] };
      const sel = target.some((a) => a.id === state.selectedAreaId) ? state.selectedAreaId : (target[0]?.id ?? null);
      return { ...withDoc(state, next), selectedAreaId: sel, selectedHandle: null, tool: { kind: 'none' } };
    }

    case 'notify':
      return notice(state, action.tone, action.text);

    case 'clear-notice':
      return state.notice ? { ...state, notice: null } : state;
  }
}
