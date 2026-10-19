import {
  useCallback,
  useEffect,
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
import { interiorLabelPoint, pointInRegion, type Point } from '../geometry/polygon';
import { meanLuminance, type LoadedImage } from '../imaging/loadImage';
import { Renderer, type RenderArea } from '../render/renderer';
import type { Action } from '../state/editor';
import { areaValidity, effectiveMaterial } from '../state/selectors';
import type { EditorState, HandleRef, PrintArea, SceneDoc } from '../state/types';
import { Button } from './controls';
import { Icon } from './icons';

export interface ResolvedImage {
  key: string;
  image: LoadedImage;
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
  zoom: number;
  emptyState: ReactNode;
  onRendererReady?: (maxTextureSize: number) => void;
  onKeepTextures?: (keys: Set<string>) => void;
}

type Drag =
  | { kind: 'handle'; pointerId: number; handle: HandleRef }
  | { kind: 'pan'; pointerId: number; start: Point; startPlacement: Placement; projection: AreaProjection }
  | { kind: 'pinch'; ids: [number, number]; startDist: number; startScale: number }
  | { kind: 'tap'; pointerId: number; x: number; y: number };

const MAX_DPR = 2.5;
const CLOSE_DISTANCE_PX = 16;

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

export function Stage(props: StageProps) {
  const { doc, state, photo, dispatch, zoom } = props;
  const viewportRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [glState, setGlState] = useState<'pending' | 'ok' | 'unavailable' | 'lost'>('pending');
  const [avail, setAvail] = useState({ w: 0, h: 0 });
  const [dpr, setDpr] = useState(() => Math.min(MAX_DPR, window.devicePixelRatio || 1));
  const [hover, setHover] = useState<Point | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const [dragging, setDragging] = useState(false);

  const imgW = photo?.image.width ?? 0;
  const imgH = photo?.image.height ?? 0;
  const fit = imgW && imgH && avail.w && avail.h ? Math.min(avail.w / imgW, avail.h / imgH) : 0;
  const dispW = Math.max(1, Math.floor(imgW * fit * zoom));
  const dispH = Math.max(1, Math.floor(imgH * fit * zoom));

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
    // Device-pixel-ratio changes (browser zoom, moving to another monitor).
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

  // --- render ---------------------------------------------------------------------------------
  const renderAreas = useMemo((): RenderArea[] => {
    if (!doc || !photo) return [];
    const out: RenderArea[] = [];
    for (const area of doc.areas) {
      if (!areaValidity(area, doc.aspect).renderable) continue;
      const art = props.resolveArtwork(area.artworkKey);
      if (!art) continue;
      const projection = projectionForQuad(area.perspective);
      if (!projection) continue;
      const artAspect = art.image.width / art.image.height;
      out.push({
        id: area.id,
        boundary: area.boundary,
        exclusions: area.exclusions.filter((c) => c.length >= 3),
        imgToSurf: projection.imageToSurface,
        imgToArt: imageToArtworkMatrix(projection, area.placement, area.surfaceAspect, artAspect),
        art: { key: art.key, canvas: art.image.canvas, width: art.image.width, height: art.image.height },
        repeat: area.placement.repeat,
        surfaceAspect: area.surfaceAspect,
        material: effectiveMaterial(props.materialFor(area.materialId), area.appearance),
        meanLuminance: areaLuminance(photo, area),
        frameHeightPx: frameScreenHeight(area.perspective, dispW * dpr, dispH * dpr),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, photo, props.resolveArtwork, props.materialFor, dispW, dispH, dpr]);

  useEffect(() => {
    const r = rendererRef.current;
    if (!r || glState !== 'ok' || !photo || fit === 0) return;
    const id = requestAnimationFrame(() => {
      r.resize(dispW, dispH, dpr);
      r.render({
        photo: { key: photo.key, canvas: photo.image.canvas, width: photo.image.width, height: photo.image.height },
        exposure: state.lighting.exposure,
        warmth: state.lighting.warmth,
        areas: renderAreas,
      });
      const keep = new Set<string>([photo.key, ...renderAreas.map((a) => a.art.key)]);
      props.onKeepTextures?.(keep);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderAreas, photo, dispW, dispH, dpr, glState, fit, state.lighting.exposure, state.lighting.warmth]);

  // --- coordinates ----------------------------------------------------------------------------
  const toImage = useCallback((clientX: number, clientY: number): Point => {
    const rect = sizerRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  }, []);

  const selected = doc?.areas.find((a) => a.id === state.selectedAreaId) ?? null;
  const drawing = state.tool.kind === 'draw' ? state.tool : null;
  const selectedProjection = useMemo(() => (selected ? projectionForQuad(selected.perspective) : null), [selected]);

  // --- pointer handling ----------------------------------------------------------------------
  const startHandleDrag = (e: ReactPointerEvent, handle: HandleRef) => {
    e.stopPropagation();
    e.preventDefault();
    sizerRef.current?.setPointerCapture(e.pointerId);
    dispatch({ type: 'checkpoint' });
    dispatch({ type: 'select-handle', handle });
    dragRef.current = { kind: 'handle', pointerId: e.pointerId, handle };
    setDragging(true);
  };

  const startInsertDrag = (e: ReactPointerEvent, target: 'boundary' | number, edgeIndex: number) => {
    e.stopPropagation();
    e.preventDefault();
    sizerRef.current?.setPointerCapture(e.pointerId);
    dispatch({ type: 'insert-point', target, edgeIndex });
    const handle: HandleRef = target === 'boundary' ? { kind: 'boundary', index: edgeIndex + 1 } : { kind: 'cutout', cutout: target, index: edgeIndex + 1 };
    dragRef.current = { kind: 'handle', pointerId: e.pointerId, handle };
    setDragging(true);
  };

  const startPan = (e: ReactPointerEvent) => {
    if (!selected || !selectedProjection) return;
    e.stopPropagation();
    sizerRef.current?.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.entries()];
      dragRef.current = {
        kind: 'pinch',
        ids: [a[0], b[0]],
        startDist: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y) || 1,
        startScale: selected.placement.scale,
      };
      return;
    }
    dispatch({ type: 'checkpoint' });
    dragRef.current = {
      kind: 'pan',
      pointerId: e.pointerId,
      start: toImage(e.clientX, e.clientY),
      startPlacement: selected.placement,
      projection: selectedProjection,
    };
    setDragging(true);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { kind: 'tap', pointerId: e.pointerId, x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (drawing && e.pointerType === 'mouse') setHover(toImage(e.clientX, e.clientY));
    if (!d) return;
    if (d.kind === 'handle' && e.pointerId === d.pointerId) {
      dispatch({ type: 'move-handle', handle: d.handle, point: toImage(e.clientX, e.clientY) });
    } else if (d.kind === 'pan' && e.pointerId === d.pointerId) {
      const placement = panPlacement(d.projection, d.startPlacement, d.start, toImage(e.clientX, e.clientY));
      dispatch({ type: 'set-placement', patch: { offsetX: placement.offsetX, offsetY: placement.offsetY } });
    } else if (d.kind === 'pinch' && pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const a = pointersRef.current.get(d.ids[0]);
      const b = pointersRef.current.get(d.ids[1]);
      if (a && b) dispatch({ type: 'set-placement', patch: { scale: clampScale((d.startScale * Math.hypot(a.x - b.x, a.y - b.y)) / d.startDist) } });
    }
  };

  const endPointer = (e: ReactPointerEvent, cancelled: boolean) => {
    pointersRef.current.delete(e.pointerId);
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === 'tap' && d.pointerId === e.pointerId) {
      dragRef.current = null;
      if (cancelled || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || !doc) return;
      const p = toImage(e.clientX, e.clientY);
      if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return;
      if (drawing) {
        const first = drawing.points[0];
        if (first && drawing.points.length >= 3 && Math.hypot((p.x - first.x) * dispW, (p.y - first.y) * dispH) < CLOSE_DISTANCE_PX) {
          dispatch({ type: 'draw-finish' });
        } else {
          dispatch({ type: 'draw-add-point', point: p });
        }
        return;
      }
      // Select the top-most area under the pointer (later areas are drawn on top).
      for (let i = doc.areas.length - 1; i >= 0; i--) {
        const a = doc.areas[i];
        if (pointInRegion(p, a.boundary, a.exclusions)) {
          dispatch({ type: 'select-area', id: a.id });
          return;
        }
      }
      return;
    }
    if (d.kind === 'pinch') {
      if (pointersRef.current.size < 2) {
        dragRef.current = null;
        setDragging(false);
      }
      return;
    }
    if ('pointerId' in d && d.pointerId === e.pointerId) {
      dragRef.current = null;
      setDragging(false);
    }
  };

  // Ctrl/⌘ + wheel (and trackpad pinch) scales the artwork in artwork mode.
  useEffect(() => {
    const el = sizerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (state.mode !== 'artwork' || !selected || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      dispatch({ type: 'set-placement', patch: { scale: clampScale(selected.placement.scale * Math.exp(-e.deltaY * 0.002)) } });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [state.mode, selected, dispatch]);

  const onHandleKey = (e: ReactKeyboardEvent, handle: HandleRef) => {
    const step = e.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[e.key]) {
      e.preventDefault();
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
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
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
    () => (doc ? doc.areas.map((a) => ({ id: a.id, name: a.name, p: interiorLabelPoint(a.boundary, a.exclusions, doc.aspect) })) : []),
    [doc],
  );

  const handles: { handle: HandleRef; p: Point; label: string }[] = [];
  const midpoints: { target: 'boundary' | number; edge: number; p: Point; label: string }[] = [];
  if (selected && !drawing) {
    if (state.mode === 'shape') {
      const n = selected.boundary.length;
      selected.boundary.forEach((p, i) => {
        handles.push({ handle: { kind: 'boundary', index: i }, p, label: `Outline point ${i + 1} of ${n}` });
        const q = selected.boundary[(i + 1) % n];
        midpoints.push({ target: 'boundary', edge: i, p: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, label: `Add a point between ${i + 1} and ${((i + 1) % n) + 1}` });
      });
    } else if (state.mode === 'cutouts') {
      selected.exclusions.forEach((c, ci) => {
        c.forEach((p, i) => {
          handles.push({ handle: { kind: 'cutout', cutout: ci, index: i }, p, label: `Cutout ${ci + 1}, point ${i + 1} of ${c.length}` });
          const q = c[(i + 1) % c.length];
          midpoints.push({ target: ci, edge: i, p: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, label: `Add a point to cutout ${ci + 1}` });
        });
      });
    } else if (state.mode === 'perspective') {
      const names = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
      selected.perspective.forEach((p, i) => handles.push({ handle: { kind: 'perspective', index: i }, p, label: `Perspective corner, ${names[i]}` }));
    }
  }

  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
  const showPhoto = props.photoStatus === 'ready' && photo && fit > 0;

  return (
    <div className="rv-stage">
      <div ref={viewportRef} className={`rv-stage__viewport${zoom > 1 ? ' is-zoomed' : ''}`}>
        {!doc && props.photoStatus === 'none' && <div className="rv-stage__empty">{props.emptyState}</div>}
        <div
          ref={sizerRef}
          className={`rv-stage__sizer${drawing ? ' is-drawing' : ''}${dragging ? ' is-dragging' : ''}${state.mode === 'artwork' ? ' is-artwork' : ''}`}
          style={{ width: showPhoto ? W : 0, height: showPhoto ? Hh : 0, visibility: showPhoto ? 'visible' : 'hidden' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endPointer(e, false)}
          onPointerCancel={(e) => endPointer(e, true)}
          onPointerLeave={() => setHover(null)}
          data-testid="stage"
        >
          <canvas ref={canvasRef} className="rv-stage__canvas" role="img" aria-label={doc ? `Room preview with ${doc.areas.length} print area${doc.areas.length === 1 ? '' : 's'}` : 'Room preview'} />
          <span className="rv-crop rv-crop--tl" aria-hidden="true" />
          <span className="rv-crop rv-crop--tr" aria-hidden="true" />
          <span className="rv-crop rv-crop--bl" aria-hidden="true" />
          <span className="rv-crop rv-crop--br" aria-hidden="true" />
          {showPhoto && doc && (
            <svg className="rv-stage__svg" width={W} height={Hh} viewBox={`0 0 ${W} ${Hh}`} aria-hidden="true">
              <defs>
                <pattern id="rv-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="7" height="7" fill="rgba(180,53,31,.10)" />
                  <line x1="0" y1="0" x2="0" y2="7" stroke="rgba(180,53,31,.55)" strokeWidth="2" />
                </pattern>
              </defs>
              {doc.areas.map((a) => {
                const isSel = a.id === state.selectedAreaId;
                const v = areaValidity(a, doc.aspect);
                const d = pathFor(a.boundary, W, Hh);
                return (
                  <g key={a.id} className={`rv-ol${isSel ? ' is-selected' : ''}${v.boundary ? ' is-invalid' : ''}`}>
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
              {drawing && drawing.points.length > 0 && (
                <g className="rv-draft">
                  <path d={pathFor(drawing.points, W, Hh, false)} className="rv-draft__line" />
                  {hover && <path d={pathFor([drawing.points[drawing.points.length - 1], hover], W, Hh, false)} className="rv-draft__rubber" />}
                  {drawing.points.map((p, i) => (
                    <circle key={i} cx={p.x * W} cy={p.y * Hh} r={i === 0 && drawing.points.length >= 3 ? 9 : 5} className={i === 0 ? 'rv-draft__first' : 'rv-draft__pt'} />
                  ))}
                </g>
              )}
            </svg>
          )}

          {showPhoto && selected && state.mode === 'artwork' && !drawing && selected.artworkKey && (
            <div
              className="rv-pan"
              style={{ clipPath: `polygon(${selected.boundary.map((p) => `${pct(p.x)} ${pct(p.y)}`).join(',')})` }}
              onPointerDown={startPan}
              aria-hidden="true"
            />
          )}

          {showPhoto &&
            !drawing &&
            labels.map((l, i) => (
              <button
                key={l.id}
                type="button"
                className={`rv-badge${l.id === state.selectedAreaId ? ' is-selected' : ''}`}
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
            <p>
              This browser cannot draw the print preview (WebGL is turned off or unsupported). You can still outline areas. Try enabling hardware acceleration or
              another browser.
            </p>
          </div>
        )}
        {glState === 'lost' && (
          <div className="rv-stage__status rv-stage__status--banner" role="status">
            <span className="rv-spinner" aria-hidden="true" /> The graphics processor was reset. Restoring the preview…
          </div>
        )}
      </div>
    </div>
  );
}
