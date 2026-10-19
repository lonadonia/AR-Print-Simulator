import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react';
import type { Catalog, PresetArea } from './catalog/types';
import { config } from './config';
import { orderQuadCorners } from './geometry/homography';
import { validatePolygon } from './geometry/polygon';
import { imageStore, useImageStore } from './imaging/imageStore';
import { ImageLoadError, loadLocalImage, type LoadedImage } from './imaging/loadImage';
import { createArea, editorReducer, initialState } from './state/editor';
import { selectArea, selectDoc } from './state/selectors';
import type { PrintArea } from './state/types';
import { AreaEditor, type ArtworkStatus, type UploadedArtwork } from './ui/AreaEditor';
import { AreaList } from './ui/AreaList';
import { Button, IconButton, Notice } from './ui/controls';
import { Icon } from './ui/icons';
import { LightingPanel } from './ui/LightingPanel';
import { RoomPicker, type UploadedRoom } from './ui/RoomPicker';
import { Stage, type ResolvedImage } from './ui/Stage';
import { UploadButton } from './ui/UploadButton';

const MAX_UPLOADED_ROOMS = 3;
const MAX_UPLOADED_ARTWORK = 12;
const ZOOMS = [1, 1.5, 2, 3, 4];

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
  const [zoom, setZoom] = useState(1);
  const uploadCounter = useRef(0);

  const doc = selectDoc(state);
  const area = selectArea(state);

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

  const photo: ResolvedImage | null = activeKey && photoImage && state.sceneKey === activeKey ? { key: activeKey, image: photoImage } : null;
  const photoStatus: 'none' | 'loading' | 'ready' | 'error' = !activeKey ? 'none' : !photoEntry || photoEntry.status === 'loading' ? 'loading' : photoEntry.status === 'error' ? 'error' : 'ready';

  const chooseRoom = (key: string) => {
    setPickerOpen(false);
    if (key === activeKey) return;
    setActiveKey(key);
    setZoom(1);
    const name = key.startsWith('scene:') ? sceneForKey(key)?.title : roomUploads.find((u) => `upload-room:${u.id}` === key)?.name;
    dispatch({ type: 'notify', tone: 'info', text: `Showing “${name ?? 'room'}”. Areas drawn on other rooms stay with those rooms.` });
  };

  const onUploadRoom = async (file: File) => {
    setBusy('room');
    setRoomError(null);
    try {
      const image = await loadLocalImage(file, 'room', imageStore.maxTextureSize);
      const id = String(++uploadCounter.current);
      const key = `upload-room:${id}`;
      imageStore.putLocal(key, image);
      const entry: UploadedRoom = { id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'My photo', thumb: thumbnailOf(image, 480) };
      setRoomUploads((prev) => {
        const next = [entry, ...prev];
        // Keep memory bounded: forget the oldest uploaded photo and its areas.
        for (const old of next.slice(MAX_UPLOADED_ROOMS)) {
          imageStore.release(`upload-room:${old.id}`);
          dispatch({ type: 'forget-scene', key: `upload-room:${old.id}` });
        }
        return next.slice(0, MAX_UPLOADED_ROOMS);
      });
      setActiveKey(key);
      setZoom(1);
      setPickerOpen(false);
    } catch (err) {
      setRoomError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const removeRoomUpload = (id: string) => {
    const key = `upload-room:${id}`;
    setRoomUploads((prev) => prev.filter((u) => u.id !== id));
    if (activeKey === key) setActiveKey(catalog.scenes[0] ? `scene:${catalog.scenes[0].id}` : null);
    imageStore.release(key);
    dispatch({ type: 'forget-scene', key });
  };

  // --- artwork --------------------------------------------------------------------------------
  const libraryItem = useCallback((key: string | null) => (key?.startsWith('library:') ? (catalog.artwork.find((a) => `library:${a.id}` === key) ?? null) : null), [catalog]);

  // Load every artwork used by an area in the current room.
  const usedKeys = useMemo(() => [...new Set((doc?.areas ?? []).map((a) => a.artworkKey).filter((k): k is string => !!k))], [doc]);
  useEffect(() => {
    for (const key of usedKeys) {
      const item = libraryItem(key);
      if (item) imageStore.ensureRemote(key, item.imageUrl, 'artwork');
    }
  }, [usedKeys, libraryItem]);

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
      setArtUploads((prev) => {
        const next = [entry, ...prev];
        for (const old of next.slice(MAX_UPLOADED_ARTWORK)) {
          imageStore.release(`upload:${old.id}`);
          dispatch({ type: 'clear-artwork-everywhere', key: `upload:${old.id}` });
        }
        return next.slice(0, MAX_UPLOADED_ARTWORK);
      });
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
    const up = artUploads.find((u) => `upload:${u.id}` === a.artworkKey);
    return up ? { title: up.name, thumb: up.thumb } : { title: 'Artwork unavailable', thumb: null };
  };

  // --- keyboard shortcuts ------------------------------------------------------------------------
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.tool.kind]);

  // --- notices ----------------------------------------------------------------------------------
  useEffect(() => {
    if (!state.notice) return;
    const id = window.setTimeout(() => dispatch({ type: 'clear-notice' }), state.notice.tone === 'error' ? 6000 : 3500);
    return () => window.clearTimeout(id);
  }, [state.notice]);

  const currentRoomName = activeKey?.startsWith('scene:') ? sceneForKey(activeKey)?.title : roomUploads.find((u) => `upload-room:${u.id}` === activeKey)?.name;
  const areaIndex = doc && area ? doc.areas.findIndex((a) => a.id === area.id) : -1;
  const drawing = state.tool.kind === 'draw' ? state.tool : null;

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
          <Icon name="image" />
          <span className="rv-roombtn__text">
            <span className="rv-roombtn__label">Room</span>
            <span className="rv-roombtn__name">{currentRoomName ?? 'Choose a room'}</span>
          </span>
          <span className="rv-roombtn__change">Change</span>
        </button>
        <div className="rv-topbar__tools" role="toolbar" aria-label="View and history">
          <IconButton icon="undo" label="Undo (Ctrl+Z)" onClick={() => dispatch({ type: 'undo' })} disabled={!doc || doc.past.length === 0} />
          <IconButton icon="redo" label="Redo (Ctrl+Shift+Z)" onClick={() => dispatch({ type: 'redo' })} disabled={!doc || doc.future.length === 0} />
          <span className="rv-sep" aria-hidden="true" />
          <IconButton icon="zoom-out" label="Zoom out" onClick={() => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)])} disabled={zoom === ZOOMS[0] || !photo} />
          <span className="rv-zoom rv-num" aria-live="polite" aria-label={`Zoom ${Math.round(zoom * 100)} percent`}>
            {Math.round(zoom * 100)}%
          </span>
          <IconButton icon="zoom-in" label="Zoom in" onClick={() => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)])} disabled={zoom === ZOOMS[ZOOMS.length - 1] || !photo} />
          <IconButton icon="fit" label="Fit photo to view" onClick={() => setZoom(1)} disabled={zoom === 1} />
        </div>
      </header>

      {catalogUnavailable && (
        <div className="rv-banner" role="status">
          <Icon name="alert" size={16} /> The company library could not be loaded. You can still preview your own room photo and artwork.
        </div>
      )}

      <main className="rv-main">
        <div className="rv-stagecol">
          {drawing && (
            <div className="rv-stagebar" role="status">
              <span>
                {drawing.target === 'area' ? 'Tap around the surface' : 'Tap around the obstacle'} · {drawing.points.length} point{drawing.points.length === 1 ? '' : 's'}
              </span>
              <span className="rv-row">
                <Button variant="primary" icon="check" onClick={() => dispatch({ type: 'draw-finish' })} disabled={drawing.points.length < 3}>
                  Finish
                </Button>
                <IconButton icon="undo" label="Undo last point" onClick={() => dispatch({ type: 'draw-undo-point' })} disabled={drawing.points.length === 0} />
                <IconButton icon="close" label="Cancel drawing" onClick={() => dispatch({ type: 'draw-cancel' })} />
              </span>
            </div>
          )}
          <Stage
            doc={state.sceneKey === activeKey ? doc : null}
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
            zoom={zoom}
            photoDescription={sceneForKey(activeKey)?.description || undefined}
            onRendererReady={(max) => {
              imageStore.maxTextureSize = max;
            }}
            emptyState={
              <div className="rv-emptystage">
                <Icon name="image" size={32} />
                <h2>Start with a room</h2>
                <p>Upload a photo of your space, or pick one of the sample rooms.</p>
                <div className="rv-row rv-row--center">
                  <UploadButton label="Upload room photo" onFile={onUploadRoom} busy={busy === 'room'} variant="primary" />
                  {catalog.scenes.length > 0 && <Button onClick={() => setPickerOpen(true)}>Sample rooms</Button>}
                </div>
                {roomError && <Notice tone="error">{roomError}</Notice>}
              </div>
            }
          />
          {state.notice && (
            <div className={`rv-toast rv-toast--${state.notice.tone}`} role={state.notice.tone === 'error' ? 'alert' : 'status'} key={state.notice.id}>
              {state.notice.text}
              <button type="button" className="rv-toast__close" aria-label="Dismiss" onClick={() => dispatch({ type: 'clear-notice' })}>
                <Icon name="close" size={14} />
              </button>
            </div>
          )}
        </div>

        <aside className="rv-panel" aria-label="Editing controls">
          {doc && state.sceneKey === activeKey ? (
            <>
              <AreaList doc={doc} state={state} dispatch={dispatch} describeArtwork={describeArtwork} describeMaterial={(a) => materialFor(a.materialId)?.name ?? null} />
              {area && areaIndex >= 0 ? (
                <AreaEditor
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
                />
              ) : (
                doc.areas.length > 0 && <p className="rv-empty rv-section">Select an area on the photo or in the list to edit it.</p>
              )}
              <LightingPanel lighting={state.lighting} dispatch={dispatch} />
            </>
          ) : (
            <section className="rv-section">
              <p className="rv-empty">{photoStatus === 'loading' ? 'Loading the room…' : 'Choose or upload a room photo to start adding print areas.'}</p>
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
      />
    </div>
  );
}
