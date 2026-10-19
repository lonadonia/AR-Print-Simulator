import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { MaterialItem } from '../catalog/types';
import { applyHomography } from '../geometry/homography';
import {
  artworkCornersInImage,
  clampScale,
  frameScreenHeight,
  imageToArtworkMatrix,
  panPlacement,
  projectionForQuad,
  type AreaProjection,
  type Placement,
} from '../geometry/placement';
import { clampPoint, interiorLabelPoint, pointInRegion, rectPolygon, type Point } from '../geometry/polygon';
import { snapPoint, type PhotoAnalysis } from '../imaging/analysis';
import { meanLuminance, type LoadedImage } from '../imaging/loadImage';
import { Renderer, type RenderArea, type RenderFrame } from '../render/renderer';
import type { Action } from '../state/editor';
import { applyMagicSelect, type MagicMode, type MagicSettings } from '../state/magic';
import { areaValidity, effectiveMaterial } from '../state/selectors';
import type { EditorState, HandleRef, PrintArea, SceneDoc, ShapeTarget } from '../state/types';
import { Button, IconButton } from './controls';
import { Icon, type IconName } from './icons';

export interface ResolvedImage {
  key: string;
  image: LoadedImage;
}

export interface StageHandle {
  /** Renders the current preview at the photo's working resolution as a JPEG. */
  exportImage(): Promise<Blob | null>;
}

export interface StageProps {
  doc: SceneDoc | null;
  state: EditorState;
  photo: ResolvedImage | null;
  photoStatus: 'none' | 'loading' | 'ready' | 'error';
  photoError: string | null;
  onRetryPhoto: () => void;
  resolveArtwork: (key: string | null) => ResolvedImage | null;
  materialFor: (id: string | null) => MaterialItem | null;
  dispatch: Dispatch<Action>;
  emptyState: ReactNode;
  /** Accessible description of the room photo (from the CMS). */
  photoDescription?: string;
  onRendererReady?: (maxTextureSize: number) => void;
  /** Colour/edge analysis of the photo for snapping and magic selection (null while computing). */
  analysis: PhotoAnalysis | null;
  analysisStatus: 'pending' | 'ready' | 'unavailable';
  magic: MagicSettings;
  onMagicChange: (patch: Partial<MagicSettings>) => void;
}

type SnapKind = 'point' | 'corner' | 'edge' | 'angle' | 'close';

interface Snapped {
  point: Point;
  kind: SnapKind | null;
}

type Gesture =
  | { kind: 'handle'; pointerId: number; handle: HandleRef; offset: Point; pointerType: string }
  | { kind: 'artpan'; pointerId: number; start: Point; startPlacement: Placement; projection: AreaProjection }
  | { kind: 'pinch'; ids: [number, number]; startDist: number; startScale: number }
  | { kind: 'move'; pointerId: number; last: Point; moved: boolean }
  | { kind: 'viewpan'; pointerId: number; x: number; y: number; left: number; top: number }
  | { kind: 'rect'; pointerId: number; start: Point; current: Point; pointerType: string }
  | { kind: 'pen'; pointerId: number; pointerType: string }
  | { kind: 'compare'; pointerId: number }
  | { kind: 'tap'; pointerId: number; x: number; y: number; pointerType: string; shift: boolean; alt: boolean };

const MAX_DPR = 2.5;
const MAX_ZOOM = 8;
const CLOSE_DISTANCE_PX = 16;
const LOUPE_SIZE = 148;
const LOUPE_MAG = 4;

function pathFor(points: readonly Point[], w: number, h: number, close = true): string {
  if (points.length === 0) return '';
  return 'M' + points.map((p) => `${(p.x * w).toFixed(1)},${(p.y * h).toFixed(1)}`).join('L') + (close ? 'Z' : '');
}

function handleKey(h: HandleRef): string {
  return h.kind === 'cutout' ? `c${h.cutout}-${h.index}` : `${h.kind[0]}${h.index}`;
}

function sameHandle(a: HandleRef | null, b: HandleRef): boolean {
  return !!a && handleKey(a) === handleKey(b);
}

function handlePoint(area: PrintArea, h: HandleRef): Point | undefined {
  return h.kind === 'boundary' ? area.boundary[h.index] : h.kind === 'cutout' ? area.exclusions[h.cutout]?.[h.index] : area.perspective[h.index];
}

const luminanceCache = new Map<string, number>();

function areaLuminance(photo: ResolvedImage, area: PrintArea): number {
  const key = `${photo.key}|${JSON.stringify(area.boundary)}|${JSON.stringify(area.exclusions)}`;
  const hit = luminanceCache.get(key);
  if (hit !== undefined) return hit;
  const v = meanLuminance(photo.image.luminance, (x, y) => pointInRegion({ x, y }, area.boundary, area.exclusions));
  if (luminanceCache.size > 200) luminanceCache.clear();
  luminanceCache.set(key, v);
  return v;
}

const TOOL_HINTS: Record<string, string> = {
  shape: 'Drag points to reshape · drag inside the area to move it · drag a + to add a corner',
  cutouts: 'Drag the red points to adjust cutouts · use Pen, Rectangle or Magic select to add more',
  perspective: 'Line the grid up with straight lines on the real surface',
  artwork: 'Drag the design to move it · pinch or Ctrl+scroll to resize',
  material: 'Choose a print surface and fine-tune its look in the panel',
};

export const Stage = forwardRef<StageHandle, StageProps>(function Stage(props, ref) {
  const { doc, state, photo, dispatch, analysis } = props;
  const bodyRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [glState, setGlState] = useState<'pending' | 'ok' | 'unavailable' | 'lost'>('pending');
  const [avail, setAvail] = useState({ w: 0, h: 0 });
  const [dpr, setDpr] = useState(() => Math.min(MAX_DPR, window.devicePixelRatio || 1));
  const [zoom, setZoom] = useState(1);
  const [compare, setCompare] = useState<number | null>(null);
  const [loupeOn, setLoupeOn] = useState(true);
  const [hover, setHover] = useState<(Snapped & { client: Point }) | null>(null);
  const [live, setLive] = useState<(Snapped & { client: Point; touch: boolean }) | null>(null);
  const [rectDraft, setRectDraft] = useState<{ a: Point; b: Point } | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const [spaceDown, setSpaceDown] = useState(false);
  const gestureRef = useRef<Gesture | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const anchorRef = useRef<{ p: Point; vx: number; vy: number } | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const pendingMagicRef = useRef<{ p: Point; target: ShapeTarget; mode?: MagicMode } | null>(null);
  const [dragging, setDragging] = useState(false);

  const imgW = photo?.image.width ?? 0;
  const imgH = photo?.image.height ?? 0;
  const fit = imgW && imgH && avail.w && avail.h ? Math.min(avail.w / imgW, avail.h / imgH) : 0;
  const dispW = Math.max(1, Math.floor(imgW * fit * zoom));
  const dispH = Math.max(1, Math.floor(imgH * fit * zoom));
  const showPhoto = props.photoStatus === 'ready' && !!photo && fit > 0;
  const tool = state.tool;
  const drawing = tool.kind === 'draw' ? tool : null;
  const creating = tool.kind === 'draw' || tool.kind === 'rect' || tool.kind === 'magic';
  const selected = doc?.areas.find((a) => a.id === state.selectedAreaId) ?? null;
  const selectedProjection = useMemo(() => (selected ? projectionForQuad(selected.perspective) : null), [selected]);

  // Reset view when the photo changes.
  useEffect(() => {
    setZoom(1);
    setCompare(null);
  }, [photo?.key]);

  // --- renderer lifecycle -------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = Renderer.create(canvas);
    if (!r) {
      setGlState('unavailable');
      return;
    }
    rendererRef.current = r;
    setGlState('ok');
    props.onRendererReady?.(r.maxTextureSize);
    const off = r.addContextListener((s) => setGlState(s === 'lost' ? 'lost' : 'ok'));
    if (new URLSearchParams(window.location.search).has('debug')) {
      (window as unknown as Record<string, unknown>).__roomVisualizerDebug = { loseContext: () => r.debugLoseContext() };
    }
    return () => {
      off();
      r.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- sizing -------------------------------------------------------------------------------
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setAvail((prev) => (prev.w === w && prev.h === h ? prev : { w: Math.max(0, w), h: Math.max(0, h) }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let mq: MediaQueryList | null = null;
    const update = () => {
      setDpr(Math.min(MAX_DPR, window.devicePixelRatio || 1));
      mq?.removeEventListener('change', update);
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      mq.addEventListener('change', update);
    };
    update();
    return () => mq?.removeEventListener('change', update);
  }, []);

  // Keep the zoom anchor (point under the cursor) in place after the size changes.
  useLayoutEffect(() => {
    const a = anchorRef.current;
    const vp = viewportRef.current;
    const sz = sizerRef.current;
    if (!a || !vp || !sz) return;
    anchorRef.current = null;
    vp.scrollLeft = sz.offsetLeft + a.p.x * dispW - a.vx;
    vp.scrollTop = sz.offsetTop + a.p.y * dispH - a.vy;
  }, [dispW, dispH]);

  const zoomTo = useCallback(
    (next: number, clientX?: number, clientY?: number) => {
      const vp = viewportRef.current;
      const sz = sizerRef.current;
      const z = Math.min(MAX_ZOOM, Math.max(1, next));
      if (!vp || !sz || z === zoom) {
        setZoom(z);
        return;
      }
      const vr = vp.getBoundingClientRect();
      const cx = clientX ?? vr.left + vr.width / 2;
      const cy = clientY ?? vr.top + vr.height / 2;
      const sr = sz.getBoundingClientRect();
      anchorRef.current = {
        p: { x: Math.min(1, Math.max(0, (cx - sr.left) / sr.width)), y: Math.min(1, Math.max(0, (cy - sr.top) / sr.height)) },
        vx: cx - vr.left,
        vy: cy - vr.top,
      };
      setZoom(z);
    },
    [zoom],
  );

  // --- render ---------------------------------------------------------------------------------
  const buildAreas = useCallback(
    (pxW: number, pxH: number): RenderArea[] => {
      if (!doc || !photo) return [];
      const out: RenderArea[] = [];
      for (const area of doc.areas) {
        if (area.hidden || !areaValidity(area, doc.aspect).renderable) continue;
        const art = props.resolveArtwork(area.artworkKey);
        if (!art) continue;
        const projection = projectionForQuad(area.perspective);
        if (!projection) continue;
        out.push({
          id: area.id,
          boundary: area.boundary,
          exclusions: area.exclusions.filter((c) => c.length >= 3),
          imgToSurf: projection.imageToSurface,
          imgToArt: imageToArtworkMatrix(projection, area.placement, area.surfaceAspect, art.image.width / art.image.height),
          art: { key: art.key, canvas: art.image.canvas, width: art.image.width, height: art.image.height },
          repeat: area.placement.repeat,
          surfaceAspect: area.surfaceAspect,
          material: effectiveMaterial(props.materialFor(area.materialId), area.appearance),
          meanLuminance: areaLuminance(photo, area),
          frameHeightPx: frameScreenHeight(area.perspective, pxW, pxH),
        });
      }
      return out;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, photo, props.resolveArtwork, props.materialFor],
  );

  const frameFor = useCallback(
    (pxW: number, pxH: number): RenderFrame | null =>
      photo
        ? {
            photo: { key: photo.key, canvas: photo.image.canvas, width: photo.image.width, height: photo.image.height },
            exposure: state.lighting.exposure,
            warmth: state.lighting.warmth,
            areas: buildAreas(pxW, pxH),
          }
        : null,
    [photo, state.lighting.exposure, state.lighting.warmth, buildAreas],
  );

  useEffect(() => {
    const r = rendererRef.current;
    if (!r || glState !== 'ok' || !photo || fit === 0) return;
    const id = requestAnimationFrame(() => {
      const frame = frameFor(dispW * dpr, dispH * dpr);
      if (!frame) return;
      r.resize(dispW, dispH, dpr);
      r.render(frame);
      r.pruneTextures(new Set([photo.key, ...frame.areas.map((a) => a.art.key)]));
    });
    return () => cancelAnimationFrame(id);
  }, [frameFor, photo, dispW, dispH, dpr, glState, fit, renderTick]);

  useImperativeHandle(
    ref,
    () => ({
      async exportImage() {
        const r = rendererRef.current;
        if (!r || !photo) return null;
        const w = photo.image.width;
        const h = photo.image.height;
        const frame = frameFor(w, h);
        const shot = frame ? r.snapshot(frame, w, h) : null;
        setRenderTick((t) => t + 1);
        if (!shot) return null;
        const bar = Math.round(Math.max(28, shot.height * 0.035));
        const out = document.createElement('canvas');
        out.width = shot.width;
        out.height = shot.height + bar;
        const ctx = out.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(shot, 0, 0);
        ctx.fillStyle = '#1c1d20';
        ctx.fillRect(0, shot.height, out.width, bar);
        ctx.fillStyle = '#f5f3ee';
        ctx.font = `${Math.round(bar * 0.42)}px system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText('Visual preview — colours, finishes and sizes are approximate.', bar * 0.5, shot.height + bar / 2);
        return new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/jpeg', 0.92));
      },
    }),
    [frameFor, photo],
  );

  // "Before" layer for the compare slider: the untouched photo.
  useEffect(() => {
    const c = beforeRef.current;
    if (!c || compare === null || !photo) return;
    c.width = Math.max(1, Math.round(dispW * dpr));
    c.height = Math.max(1, Math.round(dispH * dpr));
    const ctx = c.getContext('2d');
    ctx?.drawImage(photo.image.canvas, 0, 0, c.width, c.height);
  }, [compare === null, photo, dispW, dispH, dpr]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- coordinates & snapping ----------------------------------------------------------------
  const toImage = useCallback((clientX: number, clientY: number): Point => {
    const rect = sizerRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  }, []);

  const snap = useCallback(
    (p: Point, opts: { pointerType: string; exclude?: HandleRef; prev?: Point; shift?: boolean; alt?: boolean; first?: Point }): Snapped => {
      const q = clampPoint(p);
      const R = opts.pointerType === 'touch' ? 12 : 9;
      // Closing a pen outline on its first point wins over everything else.
      if (opts.first && Math.hypot((q.x - opts.first.x) * dispW, (q.y - opts.first.y) * dispH) < CLOSE_DISTANCE_PX) return { point: opts.first, kind: 'close' };
      if (opts.shift && opts.prev) {
        const dx = (q.x - opts.prev.x) * dispW;
        const dy = (q.y - opts.prev.y) * dispH;
        const len = Math.hypot(dx, dy);
        const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
        return { point: clampPoint({ x: opts.prev.x + (Math.cos(ang) * len) / dispW, y: opts.prev.y + (Math.sin(ang) * len) / dispH }), kind: 'angle' };
      }
      if (opts.alt || !state.snap) return { point: q, kind: null };
      // 1. existing points of any area, cutout or perspective frame
      let best: Point | null = null;
      let bestD = R;
      if (doc) {
        for (const a of doc.areas) {
          const lists: [Point[], HandleRef['kind'], number][] = [[a.boundary, 'boundary', -1], ...a.exclusions.map((c, ci) => [c, 'cutout', ci] as [Point[], HandleRef['kind'], number])];
          if (a.id === state.selectedAreaId) lists.push([a.perspective, 'perspective', -1]);
          for (const [pts, kind, ci] of lists) {
            pts.forEach((v, i) => {
              const ex = opts.exclude;
              if (ex && a.id === state.selectedAreaId && ex.kind === kind && ex.index === i && (kind !== 'cutout' || (ex.kind === 'cutout' && ex.cutout === ci))) return;
              const d = Math.hypot((v.x - q.x) * dispW, (v.y - q.y) * dispH);
              if (d < bestD) {
                bestD = d;
                best = v;
              }
            });
          }
        }
      }
      if (best) return { point: best, kind: 'point' };
      // 2. photo corners, then strong edges
      if (analysis) {
        const s = snapPoint(analysis, q, (R * analysis.width) / dispW);
        if (s) return { point: clampPoint(s.point), kind: s.kind };
      }
      return { point: q, kind: null };
    },
    [doc, state.selectedAreaId, state.snap, analysis, dispW, dispH],
  );

  // --- pointer handling ----------------------------------------------------------------------
  const capture = (id: number) => sizerRef.current?.setPointerCapture(id);

  const startHandleDrag = (e: ReactPointerEvent, handle: HandleRef) => {
    e.stopPropagation();
    e.preventDefault();
    if (!selected) return;
    capture(e.pointerId);
    dispatch({ type: 'checkpoint' });
    dispatch({ type: 'select-handle', handle });
    const hp = handlePoint(selected, handle) ?? toImage(e.clientX, e.clientY);
    const pp = toImage(e.clientX, e.clientY);
    gestureRef.current = { kind: 'handle', pointerId: e.pointerId, handle, offset: { x: hp.x - pp.x, y: hp.y - pp.y }, pointerType: e.pointerType };
    setDragging(true);
    setLive({ point: hp, kind: null, client: { x: e.clientX, y: e.clientY }, touch: e.pointerType === 'touch' });
  };

  const startInsertDrag = (e: ReactPointerEvent, target: 'boundary' | number, edgeIndex: number) => {
    e.stopPropagation();
    e.preventDefault();
    capture(e.pointerId);
    dispatch({ type: 'insert-point', target, edgeIndex });
    const handle: HandleRef = target === 'boundary' ? { kind: 'boundary', index: edgeIndex + 1 } : { kind: 'cutout', cutout: target, index: edgeIndex + 1 };
    gestureRef.current = { kind: 'handle', pointerId: e.pointerId, handle, offset: { x: 0, y: 0 }, pointerType: e.pointerType };
    setDragging(true);
  };

  const startArtPan = (e: ReactPointerEvent) => {
    if (!selected || !selectedProjection) return;
    e.stopPropagation();
    capture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.entries()];
      gestureRef.current = { kind: 'pinch', ids: [a[0], b[0]], startDist: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y) || 1, startScale: selected.placement.scale };
      return;
    }
    dispatch({ type: 'checkpoint' });
    gestureRef.current = { kind: 'artpan', pointerId: e.pointerId, start: toImage(e.clientX, e.clientY), startPlacement: selected.placement, projection: selectedProjection };
    setDragging(true);
  };

  const startMove = (e: ReactPointerEvent) => {
    e.stopPropagation();
    capture(e.pointerId);
    gestureRef.current = { kind: 'move', pointerId: e.pointerId, last: toImage(e.clientX, e.clientY), moved: false };
  };

  const startViewPan = (e: ReactPointerEvent) => {
    const vp = viewportRef.current;
    if (!vp) return;
    e.preventDefault();
    capture(e.pointerId);
    gestureRef.current = { kind: 'viewpan', pointerId: e.pointerId, x: e.clientX, y: e.clientY, left: vp.scrollLeft, top: vp.scrollTop };
    setDragging(true);
  };

  // While an artwork gesture is in progress, a further finger anywhere on the photo (even on a
  // badge or handle) joins it as a pinch instead of triggering that control.
  const onPointerDownCapture = (e: ReactPointerEvent) => {
    const g = gestureRef.current;
    if (g && (g.kind === 'artpan' || g.kind === 'pinch') && !pointersRef.current.has(e.pointerId)) {
      e.preventDefault();
      e.stopPropagation();
      startArtPan(e);
    }
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button === 1 || tool.kind === 'hand' || spaceDown) {
      startViewPan(e);
      return;
    }
    if (e.button !== 0) return;
    const p = toImage(e.clientX, e.clientY);
    if (tool.kind === 'rect') {
      capture(e.pointerId);
      const s = snap(p, { pointerType: e.pointerType, alt: e.altKey });
      gestureRef.current = { kind: 'rect', pointerId: e.pointerId, start: s.point, current: s.point, pointerType: e.pointerType };
      setRectDraft({ a: s.point, b: s.point });
      setLive({ ...s, client: { x: e.clientX, y: e.clientY }, touch: e.pointerType === 'touch' });
      return;
    }
    if (drawing) {
      capture(e.pointerId);
      gestureRef.current = { kind: 'pen', pointerId: e.pointerId, pointerType: e.pointerType };
      const s = snap(p, { pointerType: e.pointerType, prev: drawing.points.at(-1), shift: e.shiftKey, alt: e.altKey, first: drawing.points.length >= 3 ? drawing.points[0] : undefined });
      setLive({ ...s, client: { x: e.clientX, y: e.clientY }, touch: e.pointerType === 'touch' });
      return;
    }
    gestureRef.current = { kind: 'tap', pointerId: e.pointerId, x: e.clientX, y: e.clientY, pointerType: e.pointerType, shift: e.shiftKey, alt: e.altKey };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const g = gestureRef.current;
    const p = toImage(e.clientX, e.clientY);
    if (e.pointerType === 'mouse') setCursor(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 ? p : null);
    if (drawing && e.pointerType === 'mouse' && !g) {
      const s = snap(p, { pointerType: 'mouse', prev: drawing.points.at(-1), shift: e.shiftKey, alt: e.altKey, first: drawing.points.length >= 3 ? drawing.points[0] : undefined });
      setHover({ ...s, client: { x: e.clientX, y: e.clientY } });
    } else if (hover && !drawing) setHover(null);
    if (!g) return;
    if (g.kind === 'handle' && e.pointerId === g.pointerId) {
      const target = { x: p.x + g.offset.x, y: p.y + g.offset.y };
      const s = snap(target, { pointerType: g.pointerType, exclude: g.handle, alt: e.altKey });
      dispatch({ type: 'move-handle', handle: g.handle, point: s.point });
      setLive({ ...s, client: { x: e.clientX, y: e.clientY }, touch: g.pointerType === 'touch' });
    } else if (g.kind === 'artpan' && e.pointerId === g.pointerId) {
      const placement = panPlacement(g.projection, g.startPlacement, g.start, p);
      dispatch({ type: 'set-placement', patch: { offsetX: placement.offsetX, offsetY: placement.offsetY } });
    } else if (g.kind === 'pinch' && pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const a = pointersRef.current.get(g.ids[0]);
      const b = pointersRef.current.get(g.ids[1]);
      if (a && b) dispatch({ type: 'set-placement', patch: { scale: clampScale((g.startScale * Math.hypot(a.x - b.x, a.y - b.y)) / g.startDist) } });
    } else if (g.kind === 'move' && e.pointerId === g.pointerId) {
      const dx = p.x - g.last.x;
      const dy = p.y - g.last.y;
      if (!g.moved && Math.hypot(dx * dispW, dy * dispH) < 3) return;
      if (!g.moved) {
        dispatch({ type: 'checkpoint' });
        setDragging(true);
      }
      gestureRef.current = { ...g, last: p, moved: true };
      dispatch({ type: 'translate-area', dx, dy });
    } else if (g.kind === 'viewpan' && e.pointerId === g.pointerId) {
      const vp = viewportRef.current;
      if (vp) {
        vp.scrollLeft = g.left - (e.clientX - g.x);
        vp.scrollTop = g.top - (e.clientY - g.y);
      }
    } else if (g.kind === 'rect' && e.pointerId === g.pointerId) {
      const s = snap(p, { pointerType: g.pointerType, alt: e.altKey });
      gestureRef.current = { ...g, current: s.point };
      setRectDraft({ a: g.start, b: s.point });
      setLive({ ...s, client: { x: e.clientX, y: e.clientY }, touch: g.pointerType === 'touch' });
    } else if (g.kind === 'pen' && e.pointerId === g.pointerId && drawing) {
      const s = snap(p, { pointerType: g.pointerType, prev: drawing.points.at(-1), shift: e.shiftKey, alt: e.altKey, first: drawing.points.length >= 3 ? drawing.points[0] : undefined });
      setLive({ ...s, client: { x: e.clientX, y: e.clientY }, touch: g.pointerType === 'touch' });
    } else if (g.kind === 'compare' && e.pointerId === g.pointerId) {
      setCompare(Math.min(1, Math.max(0, p.x)));
    }
  };

  const runMagic = (p: Point, target: ShapeTarget, modeOverride?: MagicMode) => {
    if (!analysis) {
      if (props.analysisStatus === 'unavailable') {
        dispatch({ type: 'notify', tone: 'info', text: 'Magic select is not available for this photo. Outline the surface with the Pen or Rectangle tool.' });
      } else {
        // Run the tap as soon as the photo analysis is ready.
        pendingMagicRef.current = { p, target, mode: modeOverride };
        dispatch({ type: 'notify', tone: 'info', text: 'Analysing the photo — the surface will be selected in a moment.' });
      }
      return;
    }
    const mode = target === 'area' ? (modeOverride ?? props.magic.mode) : 'new';
    if (mode !== 'new' && !selected) {
      dispatch({ type: 'notify', tone: 'info', text: 'Select a print area first to add to it or remove from it.' });
      return;
    }
    applyMagicSelect(analysis, p, target, { ...props.magic, mode }, selected, dispatch);
  };

  const runMagicRef = useRef(runMagic);
  runMagicRef.current = runMagic;
  useEffect(() => {
    const pend = pendingMagicRef.current;
    if (!pend || !analysis) return;
    pendingMagicRef.current = null;
    runMagicRef.current(pend.p, pend.target, pend.mode);
  }, [analysis]);

  const selectAt = (p: Point) => {
    if (!doc) return;
    for (let i = doc.areas.length - 1; i >= 0; i--) {
      const a = doc.areas[i];
      if (pointInRegion(p, a.boundary, a.exclusions)) {
        if (a.id !== state.selectedAreaId) dispatch({ type: 'select-area', id: a.id });
        return;
      }
    }
  };

  const endPointer = (e: ReactPointerEvent, cancelled: boolean) => {
    pointersRef.current.delete(e.pointerId);
    const g = gestureRef.current;
    if (!g) return;
    const p = toImage(e.clientX, e.clientY);
    const finish = () => {
      gestureRef.current = null;
      setDragging(false);
      setLive(null);
    };
    if (g.kind === 'pinch') {
      if (pointersRef.current.size < 2) finish();
      return;
    }
    if ('pointerId' in g && g.pointerId !== e.pointerId) return;
    if (g.kind === 'rect') {
      finish();
      setRectDraft(null);
      if (cancelled) return;
      const s = snap(p, { pointerType: g.pointerType, alt: e.altKey }).point;
      const w = Math.abs(s.x - g.start.x);
      const h = Math.abs(s.y - g.start.y);
      if (w * dispW < 6 || h * dispH < 6) {
        dispatch({ type: 'notify', tone: 'info', text: 'Drag from one corner of the surface to the opposite corner.' });
        return;
      }
      const target = tool.kind === 'rect' ? tool.target : 'area';
      dispatch({ type: 'add-shape', target, boundary: rectPolygon((s.x + g.start.x) / 2, (s.y + g.start.y) / 2, w, h) });
      return;
    }
    if (g.kind === 'pen') {
      const s = live;
      finish();
      if (cancelled || !drawing || !s) return;
      if (s.kind === 'close') dispatch({ type: 'draw-finish' });
      else if (s.point.x >= 0 && s.point.x <= 1 && s.point.y >= 0 && s.point.y <= 1) dispatch({ type: 'draw-add-point', point: s.point });
      return;
    }
    if (g.kind === 'tap') {
      gestureRef.current = null;
      if (cancelled || Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8 || !doc) return;
      if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return;
      // Double tap (touch) zooms in around the point / back to fit.
      if (g.pointerType === 'touch') {
        const now = performance.now();
        const lt = lastTapRef.current;
        lastTapRef.current = { t: now, x: e.clientX, y: e.clientY };
        if (lt && now - lt.t < 320 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 30 && tool.kind === 'none') {
          lastTapRef.current = null;
          zoomTo(zoom > 1 ? 1 : 2.5, e.clientX, e.clientY);
          return;
        }
      }
      if (tool.kind === 'magic') {
        // Shift adds to the selected area, Alt removes from it (as in photo editors).
        runMagic(p, tool.target, g.shift ? 'add' : g.alt ? 'subtract' : undefined);
        return;
      }
      selectAt(p);
      return;
    }
    // A click inside the selected outline without dragging selects whatever is under it.
    if (g.kind === 'move' && !g.moved && !cancelled) selectAt(p);
    finish();
  };

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms the view at the cursor; Alt + wheel scales artwork.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.altKey && state.mode === 'artwork' && selected) {
        e.preventDefault();
        dispatch({ type: 'set-placement', patch: { scale: clampScale(selected.placement.scale * Math.exp(-e.deltaY * 0.002)) } });
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || !showPhoto) return;
      e.preventDefault();
      zoomTo(zoom * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [state.mode, selected, dispatch, zoom, zoomTo, showPhoto]);

  // Keyboard: tools, view and compare (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === ' ' && !e.repeat && e.type === 'keydown' && showPhoto) {
        setSpaceDown(true);
        if (t === document.body) e.preventDefault();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const tools: Record<string, 'select' | 'pen' | 'rect' | 'magic' | 'hand'> = { v: 'select', p: 'pen', r: 'rect', w: 'magic', h: 'hand' };
      if (tools[k] && doc) {
        e.preventDefault();
        dispatch({ type: 'set-tool', tool: tools[k] });
      } else if (k === 's') dispatch({ type: 'set-snap', on: !state.snap });
      else if (k === 'l') setLoupeOn((v) => !v);
      else if (k === 'b' && showPhoto) setCompare((c) => (c === null ? 0.5 : null));
      else if (k === 'f' && selected) dispatch({ type: 'set-mode', mode: 'perspective' });
      else if (k === '+' || k === '=') zoomTo(zoom * 1.5);
      else if (k === '-') zoomTo(zoom / 1.5);
      else if (k === '0') zoomTo(1);
      else if (k === 'escape' && tool.kind !== 'none' && tool.kind !== 'draw') dispatch({ type: 'set-tool', tool: 'select' });
    };
    const onUp = (e: KeyboardEvent) => e.key === ' ' && setSpaceDown(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
  }, [doc, dispatch, state.snap, showPhoto, selected, zoom, zoomTo, tool.kind]);

  const onHandleKey = (e: ReactKeyboardEvent, handle: HandleRef) => {
    const step = e.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[e.key]) {
      e.preventDefault();
      e.stopPropagation();
      const [dx, dy] = moves[e.key];
      dispatch({ type: 'nudge-handle', handle, dx: (dx * step) / dispW, dy: (dy * step) / dispH });
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && handle.kind !== 'perspective') {
      e.preventDefault();
      dispatch({ type: 'remove-point', handle });
    }
  };

  // --- overlay geometry ------------------------------------------------------------------------
  const W = dispW;
  const Hh = dispH;
  const validity = selected && doc ? areaValidity(selected, doc.aspect) : null;

  const perspectiveGrid = useMemo(() => {
    if (!selectedProjection || state.mode !== 'perspective') return null;
    const lines: string[] = [];
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      const a = applyHomography(selectedProjection.surfaceToImage, { x: t, y: 0 });
      const b = applyHomography(selectedProjection.surfaceToImage, { x: t, y: 1 });
      const c = applyHomography(selectedProjection.surfaceToImage, { x: 0, y: t });
      const d = applyHomography(selectedProjection.surfaceToImage, { x: 1, y: t });
      if (a && b) lines.push(pathFor([a, b], W, Hh, false));
      if (c && d) lines.push(pathFor([c, d], W, Hh, false));
    }
    return lines;
  }, [selectedProjection, state.mode, W, Hh]);

  const artworkOutline = useMemo(() => {
    if (!selected || !selectedProjection || state.mode !== 'artwork' || selected.placement.repeat) return null;
    const art = props.resolveArtwork(selected.artworkKey);
    if (!art) return null;
    const corners = artworkCornersInImage(selectedProjection, selected.placement, selected.surfaceAspect, art.image.width / art.image.height);
    return corners ? pathFor(corners, W, Hh) : null;
  }, [selected, selectedProjection, state.mode, W, Hh, props]);

  const labels = useMemo(
    () => (doc ? doc.areas.map((a) => ({ id: a.id, name: a.name, hidden: a.hidden, p: interiorLabelPoint(a.boundary, a.exclusions, doc.aspect) })) : []),
    [doc],
  );

  const handles: { handle: HandleRef; p: Point; label: string }[] = [];
  const midpoints: { target: 'boundary' | number; edge: number; p: Point; label: string }[] = [];
  if (selected && !creating) {
    if (state.mode === 'shape') {
      const n = selected.boundary.length;
      selected.boundary.forEach((p, i) => {
        handles.push({ handle: { kind: 'boundary', index: i }, p, label: `Outline point ${i + 1} of ${n}` });
        const q = selected.boundary[(i + 1) % n];
        if (Math.hypot((p.x - q.x) * W, (p.y - q.y) * Hh) > 34)
          midpoints.push({ target: 'boundary', edge: i, p: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, label: `Add a point between ${i + 1} and ${((i + 1) % n) + 1}` });
      });
    } else if (state.mode === 'cutouts') {
      selected.exclusions.forEach((c, ci) => {
        c.forEach((p, i) => {
          handles.push({ handle: { kind: 'cutout', cutout: ci, index: i }, p, label: `Cutout ${ci + 1}, point ${i + 1} of ${c.length}` });
          const q = c[(i + 1) % c.length];
          if (Math.hypot((p.x - q.x) * W, (p.y - q.y) * Hh) > 34)
            midpoints.push({ target: ci, edge: i, p: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, label: `Add a point to cutout ${ci + 1}` });
        });
      });
    } else if (state.mode === 'perspective') {
      const names = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
      selected.perspective.forEach((p, i) => handles.push({ handle: { kind: 'perspective', index: i }, p, label: `Perspective corner, ${names[i]}` }));
    }
  }

  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
  const srcScaleX = photo ? photo.image.sourceWidth / photo.image.width : 1;
  const toSourcePx = (p: Point) => (photo ? { x: Math.round(p.x * photo.image.width * srcScaleX), y: Math.round(p.y * photo.image.height * srcScaleX) } : { x: 0, y: 0 });

  // Live readout next to the pointer while drawing (segment length in photo pixels and angle).
  const readoutFrom = drawing?.points.at(-1);
  const readoutAt = live ?? hover;
  let readout: { text: string; client: Point } | null = null;
  if (readoutAt && readoutFrom && drawing && readoutAt.kind !== 'close') {
    const a = toSourcePx(readoutFrom);
    const b = toSourcePx(readoutAt.point);
    const ang = (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI;
    readout = { text: `${Math.round(Math.hypot(b.x - a.x, b.y - a.y))} px · ${Math.round(ang)}°`, client: readoutAt.client };
  } else if (live && rectDraft) {
    const a = toSourcePx(rectDraft.a);
    const b = toSourcePx(rectDraft.b);
    readout = { text: `${Math.abs(b.x - a.x)} × ${Math.abs(b.y - a.y)} px`, client: live.client };
  }
  const bodyRect = bodyRef.current?.getBoundingClientRect();
  const showLoupe = !!live && (live.touch || loupeOn) && !!photo && !!bodyRect;
  const snapMarker = live ?? hover;

  const toolButtons: { id: 'select' | 'pen' | 'rect' | 'magic' | 'hand'; icon: IconName; label: string; key: string; active: boolean; disabled?: boolean; mouseOnly?: boolean }[] = [
    { id: 'select', icon: 'cursor', label: 'Select and edit', key: 'V', active: tool.kind === 'none' },
    { id: 'magic', icon: 'wand', label: 'Magic select: tap a surface', key: 'W', active: tool.kind === 'magic', disabled: !doc },
    { id: 'pen', icon: 'pen', label: 'Pen: outline point by point', key: 'P', active: tool.kind === 'draw', disabled: !doc },
    { id: 'rect', icon: 'square', label: 'Rectangle: drag corner to corner', key: 'R', active: tool.kind === 'rect', disabled: !doc },
    // On touch screens one finger already pans the zoomed photo.
    { id: 'hand', icon: 'hand', label: 'Hand: pan the zoomed photo', key: 'H', active: tool.kind === 'hand', mouseOnly: true },
  ];

  const target: ShapeTarget | null = tool.kind === 'draw' || tool.kind === 'rect' || tool.kind === 'magic' ? tool.target : null;
  const targetSwitch = target && (
    <span className="rv-seg" role="group" aria-label="Create">
      {(['area', 'cutout'] as const).map((t) => (
        <button key={t} type="button" className={`rv-seg__btn${target === t ? ' is-active' : ''}`} aria-pressed={target === t} onClick={() => dispatch({ type: 'set-tool-target', target: t })}>
          {t === 'area' ? 'New area' : 'Cutout'}
        </button>
      ))}
    </span>
  );

  return (
    <div className="rv-stage">
      <div className={`rv-optionsbar${tool.kind === 'none' ? ' is-idle' : ''}`} role="region" aria-label="Tool options">
        {drawing ? (
          <div className="rv-stagebar" role="status">
            <span className="rv-optionsbar__tool">
              <Icon name="pen" size={16} /> Pen
            </span>
            {targetSwitch}
            <span className="rv-optionsbar__hint">
              {drawing.target === 'area' ? 'Place each corner of the surface' : 'Place points around the obstacle'} · {drawing.points.length} point{drawing.points.length === 1 ? '' : 's'}
              <span className="rv-optionsbar__keys"> · Shift = 15° · Alt = no snap</span>
            </span>
            <span className="rv-row rv-row--nowrap">
              <Button variant="primary" icon="check" onClick={() => dispatch({ type: 'draw-finish' })} disabled={drawing.points.length < 3}>
                Finish
              </Button>
              <IconButton icon="undo" label="Undo last point" onClick={() => dispatch({ type: 'draw-undo-point' })} disabled={drawing.points.length === 0} />
              <IconButton icon="close" label="Cancel drawing" onClick={() => dispatch({ type: 'draw-cancel' })} />
            </span>
          </div>
        ) : tool.kind === 'rect' ? (
          <div className="rv-optionsbar__row">
            <span className="rv-optionsbar__tool">
              <Icon name="square" size={16} /> Rectangle
            </span>
            {targetSwitch}
            <span className="rv-optionsbar__hint">Drag from one corner of the surface to the opposite corner</span>
            <IconButton icon="close" label="Back to select" onClick={() => dispatch({ type: 'set-tool', tool: 'select' })} />
          </div>
        ) : tool.kind === 'magic' ? (
          <div className="rv-optionsbar__row">
            <span className="rv-optionsbar__tool">
              <Icon name="wand" size={16} /> Magic select
            </span>
            <span className="rv-seg" role="group" aria-label="Selection mode">
              {(
                [
                  ['new', 'New area', 'Each tap creates a new print area'],
                  ['add', 'Add', 'Add the tapped surface to the selected area (Shift + tap)'],
                  ['subtract', 'Subtract', 'Remove the tapped surface from the selected area (Alt + tap)'],
                  ['cutout', 'Cutout', 'Cut the tapped obstacle out of the selected area'],
                ] as const
              ).map(([id, label, title]) => {
                const active = id === 'cutout' ? tool.target === 'cutout' : tool.target === 'area' && props.magic.mode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`rv-seg__btn${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    title={title}
                    disabled={id !== 'new' && !selected}
                    onClick={() => {
                      if (id === 'cutout') dispatch({ type: 'set-tool-target', target: 'cutout' });
                      else {
                        props.onMagicChange({ mode: id });
                        if (tool.target !== 'area') dispatch({ type: 'set-tool-target', target: 'area' });
                      }
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </span>
            <label className="rv-inline-slider">
              <span>Tolerance</span>
              <input type="range" min={5} max={90} step={1} value={props.magic.tolerance} onChange={(e) => props.onMagicChange({ tolerance: Number(e.target.value) })} />
              <output className="rv-num">{props.magic.tolerance}</output>
            </label>
            <button
              type="button"
              className={`rv-chiptoggle${props.magic.joints ? ' is-on' : ''}`}
              aria-pressed={props.magic.joints}
              title="Continue across thin joint lines that have the same colour on both sides: tile grout, glass-block joints, gaps between cabinet doors"
              onClick={() => props.onMagicChange({ joints: !props.magic.joints })}
            >
              <Icon name="tile" size={15} /> Across joints
            </button>
            <span className="rv-optionsbar__hint">
              {props.analysisStatus === 'ready'
                ? target === 'cutout'
                  ? 'Tap the obstacle to cut it out of the selected area'
                  : 'Tap a surface · Shift adds · Alt removes'
                : props.analysisStatus === 'unavailable'
                  ? 'Not available for this photo — use the Pen or Rectangle'
                  : 'Analysing the photo…'}
            </span>
            <IconButton icon="close" label="Back to select" onClick={() => dispatch({ type: 'set-tool', tool: 'select' })} />
          </div>
        ) : tool.kind === 'hand' ? (
          <div className="rv-optionsbar__row">
            <span className="rv-optionsbar__tool">
              <Icon name="hand" size={16} /> Hand
            </span>
            <span className="rv-optionsbar__hint">{zoom > 1 ? 'Drag to pan the photo' : 'Zoom in first (Ctrl + scroll, + or the zoom buttons), then drag to pan'}</span>
          </div>
        ) : (
          <div className="rv-optionsbar__row">
            <span className="rv-optionsbar__hint">
              {!doc
                ? 'Choose a room to start'
                : !doc.areas.length
                  ? 'Outline a surface: Magic select (W), Pen (P) or Rectangle (R)'
                  : selected
                    ? TOOL_HINTS[state.mode]
                    : 'Select an area on the photo or in the list'}
            </span>
          </div>
        )}
      </div>

      <div className="rv-stage__body" ref={bodyRef}>
        <div className="rv-toolbar" role="toolbar" aria-label="Tools" aria-orientation="vertical">
          {toolButtons.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`rv-tool${b.active ? ' is-active' : ''}${b.mouseOnly ? ' rv-hide-touch' : ''}`}
              aria-pressed={b.active}
              aria-label={`${b.label} (${b.key})`}
              title={`${b.label} (${b.key})`}
              disabled={b.disabled}
              onClick={() => dispatch({ type: 'set-tool', tool: b.id })}
            >
              <Icon name={b.icon} size={19} />
            </button>
          ))}
          <span className="rv-toolbar__sep" aria-hidden="true" />
          <button type="button" className={`rv-tool rv-tool--toggle${state.snap ? ' is-active' : ''}`} aria-pressed={state.snap} aria-label="Snap to corners, edges and points (S)" title="Snap to corners, edges and points (S)" onClick={() => dispatch({ type: 'set-snap', on: !state.snap })}>
            <Icon name="magnet" size={19} />
          </button>
          <button type="button" className={`rv-tool rv-tool--toggle rv-hide-touch${loupeOn ? ' is-active' : ''}`} aria-pressed={loupeOn} aria-label="Magnifier while dragging (L)" title="Magnifier while dragging (L) — always on for touch" onClick={() => setLoupeOn((v) => !v)}>
            <Icon name="loupe" size={19} />
          </button>
          <button type="button" className={`rv-tool rv-tool--toggle${compare !== null ? ' is-active' : ''}`} aria-pressed={compare !== null} aria-label="Before / after (B)" title="Before / after (B)" disabled={!showPhoto} onClick={() => setCompare((c) => (c === null ? 0.5 : null))}>
            <Icon name="compare" size={19} />
          </button>
          <span className="rv-toolbar__sep" aria-hidden="true" />
          <button type="button" className="rv-tool" aria-label="Zoom in (+)" title="Zoom in (+)" disabled={!showPhoto || zoom >= MAX_ZOOM} onClick={() => zoomTo(zoom * 1.5)}>
            <Icon name="zoom-in" size={19} />
          </button>
          <button type="button" className="rv-tool" aria-label="Zoom out (−)" title="Zoom out (−)" disabled={!showPhoto || zoom <= 1} onClick={() => zoomTo(zoom / 1.5)}>
            <Icon name="zoom-out" size={19} />
          </button>
          <button type="button" className="rv-tool" aria-label="Fit photo to view (0)" title="Fit photo to view (0)" disabled={zoom === 1} onClick={() => zoomTo(1)}>
            <Icon name="fit" size={19} />
          </button>
        </div>

        <div ref={viewportRef} className={`rv-stage__viewport${zoom > 1 ? ' is-zoomed' : ''}`}>
          {!doc && props.photoStatus === 'none' && <div className="rv-stage__empty">{props.emptyState}</div>}
          <div
            ref={sizerRef}
            className={[
              'rv-stage__sizer',
              creating ? 'is-drawing' : '',
              dragging ? 'is-dragging' : '',
              state.mode === 'artwork' ? 'is-artwork' : '',
              tool.kind === 'hand' || spaceDown ? 'is-hand' : '',
              tool.kind === 'magic' ? 'is-magic' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ width: showPhoto ? W : 0, height: showPhoto ? Hh : 0, visibility: showPhoto ? 'visible' : 'hidden' }}
            data-mode={state.mode}
            onPointerDownCapture={onPointerDownCapture}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => endPointer(e, false)}
            onPointerCancel={(e) => endPointer(e, true)}
            onPointerLeave={() => {
              setHover(null);
              setCursor(null);
            }}
            data-testid="stage"
          >
            <canvas
              ref={canvasRef}
              className="rv-stage__canvas"
              role="img"
              aria-label={`${props.photoDescription ? `${props.photoDescription} ` : 'Room preview. '}${doc ? `${doc.areas.length} print area${doc.areas.length === 1 ? '' : 's'}.` : ''}`}
            />
            {compare !== null && showPhoto && (
              <>
                <canvas ref={beforeRef} className="rv-compare__before" style={{ clipPath: `inset(0 ${((1 - compare) * 100).toFixed(2)}% 0 0)` }} aria-hidden="true" />
                <span className="rv-compare__label rv-compare__label--before" aria-hidden="true">
                  Before
                </span>
                <span className="rv-compare__label rv-compare__label--after" aria-hidden="true">
                  After
                </span>
                <button
                  type="button"
                  className="rv-compare__handle"
                  style={{ left: pct(compare) }}
                  role="slider"
                  aria-label="Before / after divider"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(compare * 100)}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    capture(e.pointerId);
                    gestureRef.current = { kind: 'compare', pointerId: e.pointerId };
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                      e.preventDefault();
                      setCompare((c) => Math.min(1, Math.max(0, (c ?? 0.5) + (e.key === 'ArrowLeft' ? -0.05 : 0.05))));
                    }
                  }}
                >
                  <span aria-hidden="true">
                    <Icon name="compare" size={14} />
                  </span>
                </button>
              </>
            )}
            <span className="rv-crop rv-crop--tl" aria-hidden="true" />
            <span className="rv-crop rv-crop--tr" aria-hidden="true" />
            <span className="rv-crop rv-crop--bl" aria-hidden="true" />
            <span className="rv-crop rv-crop--br" aria-hidden="true" />
            {showPhoto && doc && compare === null && (
              <svg className="rv-stage__svg" width={W} height={Hh} viewBox={`0 0 ${W} ${Hh}`} aria-hidden="true">
                <defs>
                  <pattern id="rv-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="7" height="7" fill="rgba(214,69,45,.12)" />
                    <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(214,69,45,.6)" strokeWidth="2" />
                  </pattern>
                </defs>
                {doc.areas.map((a) => {
                  const isSel = a.id === state.selectedAreaId;
                  const v = areaValidity(a, doc.aspect);
                  const d = pathFor(a.boundary, W, Hh);
                  return (
                    <g key={a.id} className={`rv-ol${isSel ? ' is-selected' : ''}${v.boundary ? ' is-invalid' : ''}${a.hidden ? ' is-hidden' : ''}`}>
                      {isSel && <path d={d} className="rv-ol__fill" />}
                      <path d={d} className="rv-ol__halo" />
                      <path d={d} className="rv-ol__line" />
                      {(isSel || state.mode === 'cutouts') &&
                        a.exclusions.map((c, ci) => (
                          <path
                            key={ci}
                            d={pathFor(c, W, Hh)}
                            className={`rv-ol__cut${isSel && state.mode === 'cutouts' ? ' is-active' : ''}${v.cutouts[ci] ? ' is-invalid' : ''}`}
                            fill={isSel && state.mode === 'cutouts' ? 'url(#rv-hatch)' : 'none'}
                          />
                        ))}
                    </g>
                  );
                })}
                {selected && state.mode === 'perspective' && (
                  <g className={`rv-persp${validity?.perspective ? ' is-invalid' : ''}`}>
                    <path d={pathFor(selected.perspective, W, Hh)} className="rv-persp__frame" />
                    {perspectiveGrid?.map((d, i) => <path key={i} d={d} className="rv-persp__grid" />)}
                  </g>
                )}
                {artworkOutline && <path d={artworkOutline} className="rv-artbounds" />}
                {rectDraft && <path d={pathFor(rectPolygon((rectDraft.a.x + rectDraft.b.x) / 2, (rectDraft.a.y + rectDraft.b.y) / 2, Math.abs(rectDraft.a.x - rectDraft.b.x), Math.abs(rectDraft.a.y - rectDraft.b.y)), W, Hh)} className="rv-draft__rect" />}
                {drawing && drawing.points.length > 0 && (
                  <g className="rv-draft">
                    <path d={pathFor(drawing.points, W, Hh, false)} className="rv-draft__line" />
                    {(live ?? hover) && <path d={pathFor([drawing.points[drawing.points.length - 1], (live ?? hover)!.point], W, Hh, false)} className="rv-draft__rubber" />}
                    {drawing.points.map((p, i) => (
                      <circle key={i} cx={p.x * W} cy={p.y * Hh} r={i === 0 && drawing.points.length >= 3 ? 8 : 4.5} className={i === 0 ? 'rv-draft__first' : 'rv-draft__pt'} />
                    ))}
                  </g>
                )}
                {snapMarker?.kind && snapMarker.kind !== 'angle' && (
                  <g className={`rv-snap rv-snap--${snapMarker.kind}`} transform={`translate(${(snapMarker.point.x * W).toFixed(1)},${(snapMarker.point.y * Hh).toFixed(1)})`}>
                    {snapMarker.kind === 'corner' ? <rect x="-7" y="-7" width="14" height="14" /> : snapMarker.kind === 'edge' ? <path d="M-8,0 L0,-8 L8,0 L0,8Z" /> : <circle r="9" />}
                  </g>
                )}
              </svg>
            )}

            {showPhoto && selected && state.mode === 'artwork' && !creating && selected.artworkKey && compare === null && (
              <div className="rv-pan" style={{ clipPath: `polygon(${selected.boundary.map((p) => `${pct(p.x)} ${pct(p.y)}`).join(',')})` }} onPointerDown={startArtPan} aria-hidden="true" />
            )}
            {showPhoto && selected && state.mode === 'shape' && !creating && compare === null && tool.kind === 'none' && (
              <div className="rv-move" style={{ clipPath: `polygon(${selected.boundary.map((p) => `${pct(p.x)} ${pct(p.y)}`).join(',')})` }} onPointerDown={startMove} aria-hidden="true" title="Drag to move the outline" />
            )}

            {showPhoto &&
              !creating &&
              compare === null &&
              labels.map((l, i) => (
                <button
                  key={l.id}
                  type="button"
                  className={`rv-badge${l.id === state.selectedAreaId ? ' is-selected' : ''}${l.hidden ? ' is-hidden' : ''}`}
                  style={{ left: pct(l.p.x), top: pct(l.p.y) }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => dispatch({ type: 'select-area', id: l.id })}
                  aria-label={`Select area ${i + 1}: ${l.name}`}
                  aria-pressed={l.id === state.selectedAreaId}
                >
                  {i + 1}
                </button>
              ))}

            {showPhoto &&
              compare === null &&
              midpoints.map((m) => (
                <button
                  key={`m-${m.target}-${m.edge}`}
                  type="button"
                  className="rv-mid"
                  style={{ left: pct(m.p.x), top: pct(m.p.y) }}
                  aria-label={m.label}
                  title="Drag or click to add a point"
                  onPointerDown={(e) => startInsertDrag(e, m.target, m.edge)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      dispatch({ type: 'insert-point', target: m.target, edgeIndex: m.edge });
                    }
                  }}
                >
                  <Icon name="plus" size={10} />
                </button>
              ))}

            {showPhoto &&
              compare === null &&
              handles.map(({ handle, p, label }) => (
                <button
                  key={handleKey(handle)}
                  type="button"
                  className={`rv-handle rv-handle--${handle.kind}${sameHandle(state.selectedHandle, handle) ? ' is-selected' : ''}`}
                  style={{ left: pct(p.x), top: pct(p.y) }}
                  aria-label={`${label}. Arrow keys move it${handle.kind !== 'perspective' ? ', Delete removes it' : ''}.`}
                  aria-pressed={sameHandle(state.selectedHandle, handle)}
                  onPointerDown={(e) => startHandleDrag(e, handle)}
                  onFocus={() => dispatch({ type: 'select-handle', handle })}
                  onKeyDown={(e) => onHandleKey(e, handle)}
                >
                  {handle.kind === 'perspective' && <span className="rv-handle__reg" aria-hidden="true" />}
                </button>
              ))}
          </div>

          {props.photoStatus === 'loading' && (
            <div className="rv-stage__status" role="status">
              <span className="rv-spinner" aria-hidden="true" /> Loading room photo…
            </div>
          )}
          {props.photoStatus === 'error' && (
            <div className="rv-stage__status rv-stage__status--error" role="alert">
              <Icon name="alert" />
              <p>{props.photoError ?? 'The room photo could not be loaded.'}</p>
              <Button onClick={props.onRetryPhoto} icon="rotate">
                Try again
              </Button>
            </div>
          )}
          {glState === 'unavailable' && (
            <div className="rv-stage__status rv-stage__status--error rv-stage__status--banner" role="alert">
              <Icon name="alert" />
              <p>This browser cannot draw the print preview (WebGL is turned off or unsupported). You can still outline areas. Try enabling hardware acceleration or another browser.</p>
            </div>
          )}
          {glState === 'lost' && (
            <div className="rv-stage__status rv-stage__status--banner" role="status">
              <span className="rv-spinner" aria-hidden="true" /> The graphics processor was reset. Restoring the preview…
            </div>
          )}
        </div>

        {showLoupe && live && bodyRect && photo && (
          <Loupe photo={photo.image} point={live.point} kind={live.kind} client={live.client} body={bodyRect} touch={live.touch} dispScale={dispW / photo.image.width} lines={loupeLines(selected, drawing?.points ?? null, rectDraft)} />
        )}
        {readout && bodyRect && (
          <div className="rv-readout rv-num" style={{ left: readout.client.x - bodyRect.left + 16, top: readout.client.y - bodyRect.top + 16 }} aria-hidden="true">
            {readout.text}
          </div>
        )}
      </div>

      <div className="rv-statusbar" aria-hidden="true">
        <span className="rv-num">{cursor && photo ? `x ${toSourcePx(cursor).x}  y ${toSourcePx(cursor).y} px` : photo ? `${photo.image.sourceWidth} × ${photo.image.sourceHeight} px` : '—'}</span>
        <span className="rv-num">Zoom {Math.round(zoom * 100)}%</span>
        <span>Snap {state.snap ? 'on' : 'off'}</span>
        {snapMarker?.kind && <span className="rv-statusbar__snap">Snapped to {snapMarker.kind === 'point' ? 'point' : snapMarker.kind === 'close' ? 'start — closes the outline' : snapMarker.kind}</span>}
        <span className="rv-statusbar__spacer" />
        <span>{!photo ? '' : props.analysisStatus === 'ready' ? 'Edge & corner snapping ready' : props.analysisStatus === 'unavailable' ? 'Snapping to photo edges unavailable' : 'Analysing photo…'}</span>
      </div>
    </div>
  );
});

/** Polylines (normalized) that the loupe should draw on top of the magnified photo. */
function loupeLines(area: PrintArea | null, draft: Point[] | null, rect: { a: Point; b: Point } | null): { pts: Point[]; closed: boolean; tone: 'area' | 'cut' | 'draft' }[] {
  const out: { pts: Point[]; closed: boolean; tone: 'area' | 'cut' | 'draft' }[] = [];
  if (area) {
    out.push({ pts: area.boundary, closed: true, tone: 'area' });
    area.exclusions.forEach((c) => out.push({ pts: c, closed: true, tone: 'cut' }));
  }
  if (draft && draft.length) out.push({ pts: draft, closed: false, tone: 'draft' });
  if (rect) out.push({ pts: rectPolygon((rect.a.x + rect.b.x) / 2, (rect.a.y + rect.b.y) / 2, Math.abs(rect.a.x - rect.b.x), Math.abs(rect.a.y - rect.b.y)), closed: true, tone: 'draft' });
  return out;
}

function Loupe({
  photo,
  point,
  kind,
  client,
  body,
  touch,
  dispScale,
  lines,
}: {
  photo: LoadedImage;
  point: Point;
  kind: SnapKind | null;
  client: Point;
  body: DOMRect;
  touch: boolean;
  dispScale: number;
  lines: { pts: Point[]; closed: boolean; tone: 'area' | 'cut' | 'draft' }[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = LOUPE_SIZE;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // Above the finger for touch, beside the cursor for mouse; flipped when near an edge.
  let left = touch ? client.x - body.left - size / 2 : client.x - body.left + 28;
  let top = touch ? client.y - body.top - size - 44 : client.y - body.top - size - 28;
  if (top < 6) top = client.y - body.top + (touch ? 44 : 28);
  if (left + size > body.width - 6) left = touch ? body.width - size - 6 : client.x - body.left - size - 28;
  left = Math.max(6, left);

  useLayoutEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    c.width = size * dpr;
    c.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pxPerSrc = LOUPE_MAG * Math.max(dispScale, 0.35);
    const sw = size / pxPerSrc;
    const sx = point.x * photo.width - sw / 2;
    const sy = point.y * photo.height - sw / 2;
    ctx.fillStyle = '#1c1d20';
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = pxPerSrc < 3;
    ctx.drawImage(photo.canvas, sx, sy, sw, sw, 0, 0, size, size);
    const map = (p: Point) => [(p.x * photo.width - sx) * pxPerSrc, (p.y * photo.height - sy) * pxPerSrc] as const;
    for (const l of lines) {
      if (l.pts.length < 2) continue;
      ctx.beginPath();
      l.pts.forEach((p, i) => {
        const [x, y] = map(p);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      if (l.closed) ctx.closePath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = l.tone === 'cut' ? '#d6452d' : l.tone === 'draft' ? '#3cc4d2' : '#1f8a95';
      ctx.stroke();
    }
    const c0 = size / 2;
    ctx.strokeStyle = kind ? '#ffd166' : '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      ctx.moveTo(c0 + dx * 6, c0 + dy * 6);
      ctx.lineTo(c0 + dx * 20, c0 + dy * 20);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c0, c0, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = kind ? '#ffd166' : '#ffffff';
    ctx.fill();
  });

  return (
    <div className="rv-loupe" style={{ left, top, width: size, height: size }} aria-hidden="true">
      <canvas ref={ref} style={{ width: size, height: size }} />
      {kind && <span className="rv-loupe__tag">{kind === 'close' ? 'close' : kind}</span>}
    </div>
  );
}
