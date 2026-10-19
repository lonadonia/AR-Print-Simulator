import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react';
import type { Catalog, PresetArea } from './catalog/types';
import { config } from './config';
import { orderQuadCorners } from './geometry/homography';
import { validatePolygon, type Point } from './geometry/polygon';
import { analyzeCanvas, type PhotoAnalysis } from './imaging/analysis';
import { imageStore, useImageStore } from './imaging/imageStore';
import { ImageLoadError, imageFromSource, loadLocalImage, type LoadedImage } from './imaging/loadImage';
import { colourwayName, parsePatternKey, patternById, patternKey, renderPattern, type Palette } from './patterns/patterns';
import { createArea, editorReducer, initialState } from './state/editor';
import { applyMagicSelect, DEFAULT_MAGIC, type MagicSettings } from './state/magic';
import { selectArea, selectDoc } from './state/selectors';
import type { PrintArea } from './state/types';
import { AreaEditor, type ArtworkStatus, type UploadedArtwork } from './ui/AreaEditor';
import { AreaList } from './ui/AreaList';
import { CameraCapture, type CameraResult } from './ui/CameraCapture';
import { Button, IconButton, Notice } from './ui/controls';
import { ExportDialog } from './ui/ExportDialog';
import { Icon } from './ui/icons';
import { LightingPanel } from './ui/LightingPanel';
import { RoomPicker, type UploadedRoom } from './ui/RoomPicker';
import { ShortcutsDialog } from './ui/ShortcutsDialog';
import { Stage, type ResolvedImage, type StageHandle } from './ui/Stage';
import { UploadButton } from './ui/UploadButton';

const MAX_UPLOADED_ROOMS = 3;
const MAX_UPLOADED_ARTWORK = 12;
/** Generated patterns kept in memory; older unused ones are dropped. */
const MAX_PATTERNS = 10;
const MAX_ANALYSES = 6;

function thumbnailOf(image: LoadedImage, maxEdge = 320): string {
  const s = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(image.width * s));
  c.height = Math.max(1, Math.round(image.height * s));
  c.getContext('2d')?.drawImage(image.canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

function errorText(err: unknown): string {
  if (err instanceof ImageLoadError) return err.message;
  return 'Something went wrong while reading this image. Please try another file.';
}

function presetToArea(p: PresetArea, i: number, sceneId: string, aspect: number, catalog: Catalog): PrintArea | null {
  if (validatePolygon(p.boundary, aspect)) return null;
  const artworkKey = p.artworkId && catalog.artwork.some((a) => a.id === p.artworkId) ? `library:${p.artworkId}` : null;
  const materialId = p.materialId && catalog.materials.some((m) => m.id === p.materialId) ? p.materialId : null;
  return createArea(`preset-${sceneId}-${i}`, p.name, p.boundary, aspect, {
    exclusions: p.exclusions.filter((c) => !validatePolygon(c, aspect)),
    perspective: p.perspective ? orderQuadCorners(p.perspective) : undefined,
    surfaceAspect: p.surfaceAspect ?? undefined,
    artworkKey,
    materialId,
  });
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'room'
  );
}

type StepId = 'room' | 'surfaces' | 'design' | 'finish' | 'review';
type ExportState = { status: 'working' } | { status: 'ready'; blob: Blob } | { status: 'error'; message: string };

export function Editor({ catalog, catalogUnavailable }: { catalog: Catalog; catalogUnavailable: boolean }) {
  const [state, dispatch] = useReducer(editorReducer, undefined, initialState);
  useImageStore();
  const [activeKey, setActiveKey] = useState<string | null>(() => (catalog.scenes[0] ? `scene:${catalog.scenes[0].id}` : null));
  const [roomUploads, setRoomUploads] = useState<UploadedRoom[]>([]);
  const [artUploads, setArtUploads] = useState<UploadedArtwork[]>([]);
  const [busy, setBusy] = useState<'room' | 'artwork' | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [artError, setArtError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [exportState, setExportState] = useState<ExportState | null>(null);
  const [magic, setMagic] = useState<MagicSettings>(DEFAULT_MAGIC);
  const [analysisEntry, setAnalysisEntry] = useState<{ key: string; value: PhotoAnalysis | null } | null>(null);
  const uploadCounter = useRef(0);
  const stageRef = useRef<StageHandle>(null);
  const analysisCache = useRef(new Map<string, PhotoAnalysis | null>());
  const pendingTap = useRef<{ key: string; point: Point } | null>(null);
  const patternKeys = useRef<string[]>([]);
  const patternThumbs = useRef(new Map<string, string>());
  const docsRef = useRef(state.docs);
  docsRef.current = state.docs;

  const doc = selectDoc(state);
  const area = selectArea(state);
  const cameraEnabled = catalog.features.camera;

  // --- room photo -----------------------------------------------------------------------------
  const sceneForKey = useCallback((key: string | null) => (key?.startsWith('scene:') ? (catalog.scenes.find((s) => `scene:${s.id}` === key) ?? null) : null), [catalog]);

  useEffect(() => {
    const scene = sceneForKey(activeKey);
    if (scene && activeKey) imageStore.ensureRemote(activeKey, scene.imageUrl, 'room');
  }, [activeKey, sceneForKey]);

  const photoEntry = activeKey ? imageStore.get(activeKey) : undefined;
  const photoImage = photoEntry?.status === 'ready' ? photoEntry.image : null;

  useEffect(() => {
    if (!activeKey || !photoImage || state.sceneKey === activeKey) return;
    const aspect = photoImage.width / photoImage.height;
    const scene = sceneForKey(activeKey);
    const presets = state.docs[activeKey] || !scene ? undefined : scene.presets.map((p, i) => presetToArea(p, i, scene.id, aspect, catalog)).filter((a): a is PrintArea => a !== null);
    dispatch({ type: 'open-scene', key: activeKey, aspect, presets });
  }, [activeKey, photoImage, state.sceneKey, state.docs, sceneForKey, catalog]);

  const photo: ResolvedImage | null = useMemo(
    () => (activeKey && photoImage && state.sceneKey === activeKey ? { key: activeKey, image: photoImage } : null),
    [activeKey, photoImage, state.sceneKey],
  );
  const photoStatus: 'none' | 'loading' | 'ready' | 'error' = !activeKey ? 'none' : !photoEntry || photoEntry.status === 'loading' ? 'loading' : photoEntry.status === 'error' ? 'error' : 'ready';

  // Edge/corner analysis for snapping and magic select, computed once per photo after it shows.
  useEffect(() => {
    if (!photo) return;
    const cached = analysisCache.current.get(photo.key);
    if (cached !== undefined) {
      setAnalysisEntry({ key: photo.key, value: cached });
      return;
    }
    const run = () => {
      let value: PhotoAnalysis | null = null;
      try {
        value = analyzeCanvas(photo.image.canvas, 800);
      } catch {
        value = null;
      }
      const cache = analysisCache.current;
      cache.set(photo.key, value);
      while (cache.size > MAX_ANALYSES) cache.delete(cache.keys().next().value!);
      setAnalysisEntry({ key: photo.key, value });
    };
    const id = window.setTimeout(run, 120);
    return () => window.clearTimeout(id);
  }, [photo]);

  const analysis = photo && analysisEntry?.key === photo.key ? analysisEntry.value : null;
  const analysisStatus: 'pending' | 'ready' | 'unavailable' = !photo || analysisEntry?.key !== photo.key ? 'pending' : analysis ? 'ready' : 'unavailable';

  const chooseRoom = (key: string) => {
    setPickerOpen(false);
    if (key === activeKey) return;
    setActiveKey(key);
    const name = key.startsWith('scene:') ? sceneForKey(key)?.title : roomUploads.find((u) => `upload-room:${u.id}` === key)?.name;
    dispatch({ type: 'notify', tone: 'info', text: `Showing “${name ?? 'room'}”. Areas drawn on other rooms stay with those rooms.` });
  };

  const addRoom = (image: LoadedImage, name: string): string => {
    const id = String(++uploadCounter.current);
    const key = `upload-room:${id}`;
    imageStore.putLocal(key, image);
    const entry: UploadedRoom = { id, name, thumb: thumbnailOf(image, 480) };
    const next = [entry, ...roomUploads];
    // Keep memory bounded: forget the oldest uploaded photo and its areas.
    for (const old of next.slice(MAX_UPLOADED_ROOMS)) {
      imageStore.release(`upload-room:${old.id}`);
      analysisCache.current.delete(`upload-room:${old.id}`);
      dispatch({ type: 'forget-scene', key: `upload-room:${old.id}` });
    }
    setRoomUploads(next.slice(0, MAX_UPLOADED_ROOMS));
    setActiveKey(key);
    setPickerOpen(false);
    return key;
  };

  const onUploadRoom = async (file: File) => {
    setBusy('room');
    setRoomError(null);
    try {
      const image = await loadLocalImage(file, 'room', imageStore.maxTextureSize);
      addRoom(image, file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'My photo');
    } catch (err) {
      setRoomError(errorText(err));
      if (!pickerOpen) dispatch({ type: 'notify', tone: 'error', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  const onCameraCapture = ({ image, tap }: CameraResult) => {
    setCameraOpen(false);
    const now = new Date();
    const key = addRoom(image, `Camera photo ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    if (tap) pendingTap.current = { key, point: tap };
    else dispatch({ type: 'notify', tone: 'info', text: 'Photo captured. Tap a surface with Magic select (W) or outline it with the Pen.' });
  };

  // A tap on the live camera view selects that surface as soon as the new photo is analysed.
  useEffect(() => {
    const t = pendingTap.current;
    if (!t || !photo || photo.key !== t.key || state.sceneKey !== t.key || analysisStatus === 'pending') return;
    pendingTap.current = null;
    if (analysis) applyMagicSelect(analysis, t.point, 'area', { ...magic, mode: 'new' }, null, dispatch);
    else dispatch({ type: 'notify', tone: 'info', text: 'Photo captured. Outline the surface with the Pen or Rectangle tool.' });
  }, [photo, state.sceneKey, analysis, analysisStatus, magic]);

  const removeRoomUpload = (id: string) => {
    const key = `upload-room:${id}`;
    setRoomUploads((prev) => prev.filter((u) => u.id !== id));
    if (activeKey === key) setActiveKey(catalog.scenes[0] ? `scene:${catalog.scenes[0].id}` : null);
    imageStore.release(key);
    analysisCache.current.delete(key);
    dispatch({ type: 'forget-scene', key });
  };

  // --- artwork --------------------------------------------------------------------------------
  const libraryItem = useCallback((key: string | null) => (key?.startsWith('library:') ? (catalog.artwork.find((a) => `library:${a.id}` === key) ?? null) : null), [catalog]);

  /** Generates a Pattern Maker design (once per pattern + colours) into the image store. */
  const ensurePattern = useCallback((key: string): LoadedImage | null => {
    const ready = imageStore.ready(key);
    if (ready) return ready;
    const parsed = parsePatternKey(key);
    const def = parsed ? patternById(parsed.id) : undefined;
    if (!parsed || !def) return null;
    const canvas = renderPattern(def, parsed.colors, def.tile ? 1024 : 2048);
    const image = imageFromSource(canvas, canvas.width, canvas.height, 'artwork', imageStore.maxTextureSize);
    patternThumbs.current.set(key, thumbnailOf(image, 160));
    imageStore.putLocal(key, image);
    // Drop the oldest generated patterns that no area in any room still uses.
    const keys = [key, ...patternKeys.current.filter((k) => k !== key)];
    const inUse = new Set(Object.values(docsRef.current).flatMap((d) => d.areas.map((a) => a.artworkKey)));
    patternKeys.current = keys.filter((k, i) => {
      if (i < MAX_PATTERNS || inUse.has(k)) return true;
      imageStore.release(k);
      patternThumbs.current.delete(k);
      return false;
    });
    return image;
  }, []);

  // Load (or generate) every artwork used by an area in the current room.
  const usedKeys = useMemo(() => [...new Set((doc?.areas ?? []).map((a) => a.artworkKey).filter((k): k is string => !!k))], [doc]);
  useEffect(() => {
    for (const key of usedKeys) {
      const item = libraryItem(key);
      if (item) imageStore.ensureRemote(key, item.imageUrl, 'artwork');
      else if (key.startsWith('pattern:') && !imageStore.get(key)) ensurePattern(key);
    }
  }, [usedKeys, libraryItem, ensurePattern]);

  const resolveArtwork = useCallback((key: string | null): ResolvedImage | null => {
    if (!key) return null;
    const img = imageStore.ready(key);
    return img ? { key, image: img } : null;
    // imageStore changes are picked up through useImageStore() re-rendering this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageStore.getVersion()]);

  const artworkAspect = useCallback(
    (key: string) => {
      const img = imageStore.ready(key);
      if (img) return img.width / img.height;
      const up = artUploads.find((u) => `upload:${u.id}` === key);
      return up ? up.aspect : null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artUploads, imageStore.getVersion()],
  );

  // Fit artwork whose proportions became known after it loaded.
  useEffect(() => {
    if (!doc) return;
    for (const a of doc.areas) {
      if (a.artworkKey && !a.placementInitialized) {
        const aspect = artworkAspect(a.artworkKey);
        if (aspect) dispatch({ type: 'init-placement', areaId: a.id, artworkAspect: aspect });
      }
    }
  }, [doc, artworkAspect]);

  const onUploadArtwork = async (file: File) => {
    setBusy('artwork');
    setArtError(null);
    try {
      const image = await loadLocalImage(file, 'artwork', imageStore.maxTextureSize);
      const id = String(++uploadCounter.current);
      const key = `upload:${id}`;
      imageStore.putLocal(key, image);
      const entry: UploadedArtwork = { id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'My artwork', aspect: image.width / image.height, thumb: thumbnailOf(image) };
      const next = [entry, ...artUploads];
      for (const old of next.slice(MAX_UPLOADED_ARTWORK)) {
        imageStore.release(`upload:${old.id}`);
        dispatch({ type: 'clear-artwork-everywhere', key: `upload:${old.id}` });
      }
      setArtUploads(next.slice(0, MAX_UPLOADED_ARTWORK));
      if (area) dispatch({ type: 'set-artwork', key, artworkAspect: entry.aspect });
    } catch (err) {
      setArtError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const removeArtUpload = (id: string) => {
    const key = `upload:${id}`;
    setArtUploads((prev) => prev.filter((u) => u.id !== id));
    imageStore.release(key);
    dispatch({ type: 'clear-artwork-everywhere', key });
  };

  const onApplyPattern = (id: string, colors: Palette) => {
    const def = patternById(id);
    if (!def || !area) return;
    const key = patternKey(id, colors);
    let image: LoadedImage | null = null;
    try {
      image = ensurePattern(key);
    } catch {
      image = null;
    }
    if (!image) {
      dispatch({ type: 'notify', tone: 'error', text: 'This pattern could not be generated on this device.' });
      return;
    }
    const aspect = image.width / image.height;
    const prev = area.artworkKey ? parsePatternKey(area.artworkKey) : null;
    const prevDef = prev ? patternById(prev.id) : undefined;
    if (prevDef && prevDef.tile === def.tile) {
      // Recolouring or switching between patterns of the same kind keeps the repeat size.
      dispatch({ type: 'set-artwork', key, artworkAspect: aspect, keepPlacement: true, placement: { repeat: def.tile } });
    } else if (def.tile) {
      dispatch({ type: 'set-artwork', key, artworkAspect: aspect, placement: { repeat: true, scale: 0.3, rotation: 0, offsetX: 0.5, offsetY: 0.5 } });
    } else {
      dispatch({ type: 'set-artwork', key, artworkAspect: aspect });
      dispatch({ type: 'set-placement', patch: { repeat: false } });
    }
  };

  const artworkStatus: ArtworkStatus = useMemo(() => {
    const key = area?.artworkKey ?? null;
    const item = libraryItem(key);
    const entry = key ? imageStore.get(key) : undefined;
    const retry = () => item && key && imageStore.retry(key, item.imageUrl, 'artwork');
    if (!key) return { state: 'none', message: null, retry };
    if (!entry) return key.startsWith('upload:') ? { state: 'error', message: 'This uploaded artwork was removed. Choose or upload another.', retry } : { state: 'loading', message: null, retry };
    if (entry.status === 'error') return { state: 'error', message: errorText(entry.error), retry };
    return { state: entry.status, message: null, retry };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area?.artworkKey, libraryItem, imageStore.getVersion()]);

  const materialFor = useCallback((id: string | null) => (id ? (catalog.materials.find((m) => m.id === id) ?? null) : null), [catalog]);

  const describeArtwork = (a: PrintArea) => {
    if (!a.artworkKey) return null;
    const item = libraryItem(a.artworkKey);
    if (item) return { title: item.title, thumb: item.thumbnailUrl ?? item.imageUrl };
    const pattern = parsePatternKey(a.artworkKey);
    if (pattern) return { title: `${patternById(pattern.id)?.name ?? 'Pattern'} · ${colourwayName(pattern.colors)}`, thumb: patternThumbs.current.get(a.artworkKey) ?? null };
    const up = artUploads.find((u) => `upload:${u.id}` === a.artworkKey);
    return up ? { title: up.name, thumb: up.thumb } : { title: 'Artwork unavailable', thumb: null };
  };

  // --- output --------------------------------------------------------------------------------
  const currentRoomName = activeKey?.startsWith('scene:') ? sceneForKey(activeKey)?.title : roomUploads.find((u) => `upload-room:${u.id}` === activeKey)?.name;
  const currentRoomThumb = activeKey?.startsWith('scene:')
    ? (() => {
        const s = sceneForKey(activeKey);
        return s ? (s.thumbnailUrl ?? s.imageUrl) : null;
      })()
    : (roomUploads.find((u) => `upload-room:${u.id}` === activeKey)?.thumb ?? null);

  const openExport = async () => {
    if (!photo || !stageRef.current) return;
    setExportState({ status: 'working' });
    // Let the dialog paint before the (synchronous) full-resolution render.
    await new Promise((r) => window.setTimeout(r, 40));
    try {
      const blob = await stageRef.current.exportImage();
      setExportState(blob ? { status: 'ready', blob } : { status: 'error', message: 'The preview could not be rendered on this device. Try again, or take a screenshot instead.' });
    } catch {
      setExportState({ status: 'error', message: 'The preview could not be rendered on this device. Try again, or take a screenshot instead.' });
    }
  };

  // --- keyboard shortcuts ------------------------------------------------------------------------
  const exportRef = useRef(openExport);
  exportRef.current = openExport;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (state.tool.kind === 'draw') {
        if (e.key === 'Escape') {
          e.preventDefault();
          dispatch({ type: 'draw-cancel' });
        } else if (e.key === 'Enter' && !typing) {
          e.preventDefault();
          dispatch({ type: 'draw-finish' });
        } else if ((e.key === 'Backspace' || e.key === 'Delete') && !typing) {
          e.preventDefault();
          dispatch({ type: 'draw-undo-point' });
        }
        return;
      }
      if (typing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void exportRef.current();
      } else if (e.key === '?') {
        setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.tool.kind]);

  // --- notices ----------------------------------------------------------------------------------
  useEffect(() => {
    if (!state.notice) return;
    const id = window.setTimeout(() => dispatch({ type: 'clear-notice' }), state.notice.tone === 'error' ? 6000 : 4200);
    return () => window.clearTimeout(id);
  }, [state.notice]);

  const areaIndex = doc && area ? doc.areas.findIndex((a) => a.id === area.id) : -1;
  const docReady = !!doc && state.sceneKey === activeKey;

  // --- workflow steps ---------------------------------------------------------------------------
  const visibleAreas = docReady ? doc!.areas.filter((a) => !a.hidden) : [];
  const steps: { id: StepId; label: string; done: boolean }[] = [
    { id: 'room', label: 'Room', done: !!photo },
    { id: 'surfaces', label: 'Surfaces', done: visibleAreas.length > 0 },
    { id: 'design', label: 'Design', done: visibleAreas.length > 0 && visibleAreas.every((a) => a.artworkKey) },
    { id: 'finish', label: 'Finish', done: visibleAreas.length > 0 && visibleAreas.every((a) => a.materialId) },
    { id: 'review', label: 'Review', done: false },
  ];
  const activeStep: StepId = pickerOpen
    ? 'room'
    : exportState
      ? 'review'
      : !photo
        ? 'room'
        : !area
          ? 'surfaces'
          : state.mode === 'artwork'
            ? 'design'
            : state.mode === 'material'
              ? 'finish'
              : 'surfaces';

  const goStep = (id: StepId) => {
    if (id === 'room') {
      setPickerOpen(true);
      return;
    }
    if (id === 'review') {
      void openExport();
      return;
    }
    if (!docReady || !doc) return;
    if (!doc.areas.length) {
      dispatch({ type: 'set-tool', tool: 'magic', target: 'area' });
      return;
    }
    const pick = id === 'design' ? doc.areas.find((a) => !a.artworkKey) : id === 'finish' ? doc.areas.find((a) => !a.materialId) : null;
    const target = area && (!pick || id === 'surfaces') ? area : (pick ?? area ?? doc.areas[0]);
    if (target.id !== state.selectedAreaId) dispatch({ type: 'select-area', id: target.id });
    dispatch({ type: 'set-mode', mode: id === 'design' ? 'artwork' : id === 'finish' ? 'material' : 'shape' });
  };

  return (
    <div className="rv-app" style={{ '--rv-photo-aspect': photoImage ? photoImage.width / photoImage.height : 1.5 } as CSSProperties}>
      <header className="rv-topbar">
        <div className="rv-brand">
          <span className="rv-brand__mark" aria-hidden="true" />
          <span className="rv-brand__title">{config.appTitle}</span>
          {catalog.source === 'demo' && (
            <span className="rv-badge-demo" title="Sample rooms and artwork bundled for demonstration. Not the company catalogue.">
              Demo content
            </span>
          )}
        </div>
        <button type="button" className="rv-roombtn" onClick={() => setPickerOpen(true)} aria-haspopup="dialog">
          <span className="rv-roombtn__thumb" aria-hidden="true">
            {currentRoomThumb ? <img src={currentRoomThumb} alt="" /> : <Icon name="image" />}
          </span>
          <span className="rv-roombtn__text">
            <span className="rv-roombtn__label">Room</span>
            <span className="rv-roombtn__name">{currentRoomName ?? 'Choose a room'}</span>
          </span>
          <span className="rv-roombtn__change">Change</span>
        </button>

        <nav className="rv-steps" aria-label="Workflow">
          <ol>
            {steps.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`rv-steps__btn${activeStep === s.id ? ' is-active' : ''}${s.done ? ' is-done' : ''}`}
                  aria-current={activeStep === s.id ? 'step' : undefined}
                  aria-label={`Step ${i + 1}: ${s.label}${s.done ? ' (done)' : ''}`}
                  title={s.label}
                  onClick={() => goStep(s.id)}
                  disabled={(s.id !== 'room' && !photo) || (s.id !== 'room' && s.id !== 'surfaces' && s.id !== 'review' && !docReady)}
                >
                  <span className="rv-steps__num" aria-hidden="true">
                    {s.done ? <Icon name="check" size={12} /> : i + 1}
                  </span>
                  <span className="rv-steps__label">{s.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="rv-topbar__tools" role="toolbar" aria-label="History and output">
          <IconButton icon="undo" label="Undo (Ctrl+Z)" onClick={() => dispatch({ type: 'undo' })} disabled={!doc || doc.past.length === 0} />
          <IconButton icon="redo" label="Redo (Ctrl+Shift+Z)" onClick={() => dispatch({ type: 'redo' })} disabled={!doc || doc.future.length === 0} />
          <IconButton icon="keyboard" label="Keyboard shortcuts (?)" onClick={() => setShortcutsOpen(true)} className="rv-hide-touch" />
          <span className="rv-sep" aria-hidden="true" />
          {cameraEnabled && (
            <button type="button" className="rv-btn rv-btn--secondary rv-topbar__cta" onClick={() => setCameraOpen(true)} aria-label="Take a room photo with the camera" title="Take a room photo with the camera">
              <Icon name="camera" />
              <span className="rv-btn__label">Camera</span>
            </button>
          )}
          <button type="button" className="rv-btn rv-btn--primary rv-topbar__cta" onClick={() => void openExport()} disabled={!photo} aria-label="Save image of the preview" title="Save image (Ctrl+S)">
            <Icon name="download" />
            <span className="rv-btn__label">Save image</span>
          </button>
        </div>
      </header>

      {catalogUnavailable && (
        <div className="rv-banner" role="status">
          <Icon name="alert" size={16} /> The company library could not be loaded. You can still preview your own room photo and artwork.
        </div>
      )}

      <main className="rv-main">
        <div className="rv-stagecol">
          <Stage
            ref={stageRef}
            doc={docReady ? doc : null}
            state={state}
            photo={photo}
            photoStatus={photoStatus}
            photoError={photoEntry?.status === 'error' ? errorText(photoEntry.error) : null}
            onRetryPhoto={() => {
              const scene = sceneForKey(activeKey);
              if (scene && activeKey) imageStore.retry(activeKey, scene.imageUrl, 'room');
            }}
            resolveArtwork={resolveArtwork}
            materialFor={materialFor}
            dispatch={dispatch}
            analysis={analysis}
            analysisStatus={analysisStatus}
            magic={magic}
            onMagicChange={(patch) => setMagic((m) => ({ ...m, ...patch }))}
            photoDescription={sceneForKey(activeKey)?.description || undefined}
            onRendererReady={(max) => {
              imageStore.maxTextureSize = max;
            }}
            emptyState={
              <div className="rv-emptystage">
                <span className="rv-emptystage__icon" aria-hidden="true">
                  <Icon name="image" size={28} />
                </span>
                <h2>Start with a room</h2>
                <p>Photograph the wall, kitchen, door or glass you want printed, upload a photo, or pick a sample room.</p>
                <div className="rv-row rv-row--center">
                  {cameraEnabled && (
                    <Button icon="camera" variant="primary" onClick={() => setCameraOpen(true)}>
                      Take a photo
                    </Button>
                  )}
                  <UploadButton label="Upload room photo" onFile={onUploadRoom} busy={busy === 'room'} variant={cameraEnabled ? 'secondary' : 'primary'} />
                  {catalog.scenes.length > 0 && (
                    <Button variant="ghost" onClick={() => setPickerOpen(true)}>
                      Sample rooms
                    </Button>
                  )}
                </div>
                {roomError && <Notice tone="error">{roomError}</Notice>}
              </div>
            }
          />
          {state.notice && (
            <div className={`rv-toast rv-toast--${state.notice.tone}`} role={state.notice.tone === 'error' ? 'alert' : 'status'} key={state.notice.id}>
              <Icon name={state.notice.tone === 'error' ? 'alert' : 'info'} size={16} />
              <span className="rv-toast__text">{state.notice.text}</span>
              <button type="button" className="rv-toast__close" aria-label="Dismiss" onClick={() => dispatch({ type: 'clear-notice' })}>
                <Icon name="close" size={14} />
              </button>
            </div>
          )}
        </div>

        <aside className="rv-panel" aria-label="Editing controls">
          {docReady && doc ? (
            <>
              <AreaList doc={doc} state={state} dispatch={dispatch} describeArtwork={describeArtwork} describeMaterial={(a) => materialFor(a.materialId)?.name ?? null} />
              {area && areaIndex >= 0 ? (
                <AreaEditor
                  key={area.id}
                  doc={doc}
                  area={area}
                  areaIndex={areaIndex}
                  state={state}
                  dispatch={dispatch}
                  catalog={catalog}
                  uploads={artUploads}
                  onUploadArtwork={onUploadArtwork}
                  uploadBusy={busy === 'artwork'}
                  uploadError={artError}
                  onRemoveUpload={removeArtUpload}
                  artworkStatus={artworkStatus}
                  artworkAspect={artworkAspect}
                  onApplyPattern={onApplyPattern}
                  patternMakerEnabled={catalog.features.patternMaker}
                />
              ) : (
                doc.areas.length > 0 && <p className="rv-empty rv-section">Select an area on the photo or in the list to edit it.</p>
              )}
              <LightingPanel lighting={state.lighting} dispatch={dispatch} />
            </>
          ) : (
            <section className="rv-section">
              <p className="rv-empty">{photoStatus === 'loading' ? 'Loading the room…' : 'Choose, photograph or upload a room to start adding print areas.'}</p>
            </section>
          )}
        </aside>
      </main>

      <RoomPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        catalog={catalog}
        currentKey={activeKey}
        uploads={roomUploads}
        onChoose={chooseRoom}
        onUpload={onUploadRoom}
        onRemoveUpload={removeRoomUpload}
        uploadBusy={busy === 'room'}
        uploadError={roomError}
        onCamera={
          cameraEnabled
            ? () => {
                setPickerOpen(false);
                setCameraOpen(true);
              }
            : undefined
        }
      />
      {cameraEnabled && (
        <CameraCapture
          open={cameraOpen}
          onClose={() => setCameraOpen(false)}
          onCapture={onCameraCapture}
          onFile={(file) => {
            setCameraOpen(false);
            void onUploadRoom(file);
          }}
          maxTextureSize={imageStore.maxTextureSize}
        />
      )}
      <ExportDialog open={exportState !== null} onClose={() => setExportState(null)} state={exportState ?? { status: 'working' }} fileName={`room-preview-${slug(currentRoomName ?? 'room')}.jpg`} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
