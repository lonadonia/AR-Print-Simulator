import { useMemo, useState, type CSSProperties, type Dispatch } from 'react';
import type { ArtworkItem, Catalog, MaterialItem } from '../catalog/types';
import { quadIssueMessage } from '../geometry/homography';
import { MAX_SCALE, MIN_SCALE } from '../geometry/placement';
import { polygonIssueMessage } from '../geometry/polygon';
import { SUPPORTED_FORMATS_LABEL } from '../imaging/loadImage';
import type { Action } from '../state/editor';
import { areaValidity, effectiveMaterial } from '../state/selectors';
import type { EditMode, EditorState, HandleRef, PrintArea, SceneDoc } from '../state/types';
import { Button, IconButton, Notice, NudgePad, Slider, Toggle } from './controls';
import { Icon, type IconName } from './icons';
import { UploadButton } from './UploadButton';

export interface UploadedArtwork {
  id: string;
  name: string;
  aspect: number;
  thumb: string;
}

export interface ArtworkStatus {
  state: 'none' | 'loading' | 'ready' | 'error';
  message: string | null;
  retry: () => void;
}

interface Props {
  doc: SceneDoc;
  area: PrintArea;
  areaIndex: number;
  state: EditorState;
  dispatch: Dispatch<Action>;
  catalog: Catalog;
  uploads: UploadedArtwork[];
  onUploadArtwork: (file: File) => void;
  uploadBusy: boolean;
  uploadError: string | null;
  onRemoveUpload: (id: string) => void;
  artworkStatus: ArtworkStatus;
  artworkAspect: (key: string) => number | null;
}

const TABS: { mode: EditMode; label: string; icon: IconName }[] = [
  { mode: 'shape', label: 'Shape', icon: 'shape' },
  { mode: 'cutouts', label: 'Cutouts', icon: 'scissors' },
  { mode: 'perspective', label: 'Perspective', icon: 'frame' },
  { mode: 'artwork', label: 'Artwork', icon: 'image' },
  { mode: 'material', label: 'Material', icon: 'palette' },
];

const NUDGE = 0.002;
const pctFmt = (v: number) => `${Math.round(v * 100)}%`;

export function AreaEditor(props: Props) {
  const { area, areaIndex, state, dispatch } = props;
  const validity = areaValidity(area, props.doc.aspect);
  const tabProblem: Partial<Record<EditMode, boolean>> = {
    shape: !!validity.boundary,
    cutouts: validity.cutouts.some(Boolean),
    perspective: !!validity.perspective,
  };

  return (
    <section className="rv-section rv-editor" aria-labelledby="rv-editor-title">
      <header className="rv-editor__head">
        <span className="rv-arealist__num" aria-hidden="true">
          {areaIndex + 1}
        </span>
        <label className="rv-visually-hidden" htmlFor="rv-area-name" id="rv-editor-title">
          Name of area {areaIndex + 1}
        </label>
        <input
          id="rv-area-name"
          className="rv-editor__name"
          value={area.name}
          maxLength={60}
          onChange={(e) => dispatch({ type: 'rename-area', id: area.id, name: e.target.value })}
        />
      </header>

      <div className="rv-tabs" role="tablist" aria-label="Edit the selected area">
        {TABS.map((t) => (
          <button
            key={t.mode}
            type="button"
            role="tab"
            id={`rv-tab-${t.mode}`}
            aria-selected={state.mode === t.mode}
            aria-controls="rv-tabpanel"
            tabIndex={state.mode === t.mode ? 0 : -1}
            className={`rv-tab${state.mode === t.mode ? ' is-active' : ''}`}
            onClick={() => dispatch({ type: 'set-mode', mode: t.mode })}
            onKeyDown={(e) => {
              const i = TABS.findIndex((x) => x.mode === state.mode);
              const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : -1;
              if (next >= 0) {
                e.preventDefault();
                dispatch({ type: 'set-mode', mode: TABS[next].mode });
                document.getElementById(`rv-tab-${TABS[next].mode}`)?.focus();
              }
            }}
          >
            <Icon name={t.icon} size={16} />
            <span>{t.label}</span>
            {tabProblem[t.mode] && <span className="rv-tab__dot" aria-label="needs attention" />}
          </button>
        ))}
      </div>

      <div className="rv-tabpanel" role="tabpanel" id="rv-tabpanel" aria-labelledby={`rv-tab-${state.mode}`}>
        {state.mode === 'shape' && <ShapeTab {...props} validityIssue={validity.boundary} />}
        {state.mode === 'cutouts' && <CutoutsTab {...props} issues={validity.cutouts} />}
        {state.mode === 'perspective' && <PerspectiveTab {...props} issue={validity.perspective} />}
        {state.mode === 'artwork' && <ArtworkTab {...props} />}
        {state.mode === 'material' && <MaterialTab {...props} />}
      </div>
    </section>
  );
}

function PointTools({ handle, dispatch, removable }: { handle: HandleRef | null; dispatch: Dispatch<Action>; removable: boolean }) {
  if (!handle) {
    return <p className="rv-hint">Select a point on the photo (or press Tab to reach it) to move it precisely.</p>;
  }
  const label = handle.kind === 'perspective' ? `Corner ${handle.index + 1}` : handle.kind === 'cutout' ? `Cutout ${handle.cutout + 1}, point ${handle.index + 1}` : `Point ${handle.index + 1}`;
  return (
    <div className="rv-pointtools">
      <span className="rv-pointtools__label">{label} selected</span>
      <NudgePad label={`Move ${label}`} onNudge={(dx, dy, big) => dispatch({ type: 'nudge-handle', handle, dx: dx * NUDGE * (big ? 10 : 1), dy: dy * NUDGE * (big ? 10 : 1) })} />
      {handle.kind !== 'perspective' && (
        <Button icon="trash" variant="ghost" onClick={() => dispatch({ type: 'remove-point', handle })} disabled={!removable}>
          Remove point
        </Button>
      )}
    </div>
  );
}

function DrawControls({ state, dispatch, target }: { state: EditorState; dispatch: Dispatch<Action>; target: 'area' | 'cutout' }) {
  if (state.tool.kind !== 'draw' || state.tool.target !== target) return null;
  const n = state.tool.points.length;
  return (
    <div className="rv-drawbox" role="status">
      <p>
        <strong>{target === 'area' ? 'Drawing a new area.' : 'Drawing a cutout.'}</strong> Tap or click around the {target === 'area' ? 'surface' : 'obstacle'}, then tap the first
        point or press Finish. {n > 0 && <span className="rv-num">{n} point{n === 1 ? '' : 's'}</span>}
      </p>
      <div className="rv-row">
        <Button variant="primary" icon="check" onClick={() => dispatch({ type: 'draw-finish' })} disabled={n < 3}>
          Finish
        </Button>
        <Button icon="undo" onClick={() => dispatch({ type: 'draw-undo-point' })} disabled={n === 0}>
          Undo point
        </Button>
        <Button variant="ghost" onClick={() => dispatch({ type: 'draw-cancel' })}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ShapeTab({ area, state, dispatch, validityIssue }: Props & { validityIssue: ReturnType<typeof areaValidity>['boundary'] }) {
  const handle = state.selectedHandle?.kind === 'boundary' ? state.selectedHandle : null;
  return (
    <div className="rv-stack">
      <DrawControls state={state} dispatch={dispatch} target="area" />
      <p className="rv-instr">
        Drag the <span className="rv-key rv-key--dot" aria-hidden="true" /> points to follow the edges of the surface. Drag a <span className="rv-key rv-key--plus" aria-hidden="true">+</span> on an
        edge to add a corner — useful for L-shaped or stepped areas.
      </p>
      {validityIssue && <Notice tone="error">{polygonIssueMessage(validityIssue)}</Notice>}
      <PointTools handle={handle} dispatch={dispatch} removable={area.boundary.length > 3} />
      <p className="rv-hint">
        {area.boundary.length} points · Use <strong>Cutouts</strong> to keep a hob, hood, socket or window unprinted.
      </p>
    </div>
  );
}

function CutoutsTab({ area, state, dispatch, issues }: Props & { issues: ReturnType<typeof areaValidity>['cutouts'] }) {
  const handle = state.selectedHandle?.kind === 'cutout' ? state.selectedHandle : null;
  return (
    <div className="rv-stack">
      <DrawControls state={state} dispatch={dispatch} target="cutout" />
      <p className="rv-instr">Cutouts keep obstacles inside the outline — a hob, extractor hood, socket, mirror or cabinet — visible and unprinted.</p>
      <div className="rv-row">
        <Button icon="pen" variant="primary" onClick={() => dispatch({ type: 'start-draw', target: 'cutout' })} disabled={state.tool.kind === 'draw'}>
          Draw cutout
        </Button>
        <Button icon="square" onClick={() => dispatch({ type: 'add-rect-cutout' })}>
          Rectangle cutout
        </Button>
      </div>
      {area.exclusions.length === 0 ? (
        <p className="rv-empty">No cutouts in this area.</p>
      ) : (
        <ul className="rv-cutlist">
          {area.exclusions.map((c, i) => (
            <li key={i} className={handle?.cutout === i ? 'is-selected' : ''}>
              <span className="rv-cutlist__swatch" aria-hidden="true" />
              <span>
                Cutout {i + 1} <span className="rv-hint">· {c.length} points</span>
                {issues[i] && (
                  <span className="rv-warn">
                    {' '}
                    <Icon name="alert" size={12} /> {polygonIssueMessage(issues[i]!)}
                  </span>
                )}
              </span>
              <IconButton icon="trash" label={`Delete cutout ${i + 1}`} tone="danger" onClick={() => dispatch({ type: 'delete-cutout', index: i })} />
            </li>
          ))}
        </ul>
      )}
      <PointTools handle={handle} dispatch={dispatch} removable={!!handle && (area.exclusions[handle.cutout]?.length ?? 0) > 3} />
    </div>
  );
}

function PerspectiveTab({ area, state, dispatch, issue }: Props & { issue: ReturnType<typeof areaValidity>['perspective'] }) {
  const handle = state.selectedHandle?.kind === 'perspective' ? state.selectedHandle : null;
  const logMin = Math.log(0.25);
  const logMax = Math.log(6);
  return (
    <div className="rv-stack">
      <p className="rv-instr">
        Move the four <span className="rv-key rv-key--reg" aria-hidden="true" /> marks until the grid lines run parallel to straight lines on the real surface — the worktop, tile joints or
        cabinet edges. The frame may be larger than the print outline.
      </p>
      {issue && <Notice tone="error">{quadIssueMessage(issue)}</Notice>}
      <PointTools handle={handle} dispatch={dispatch} removable={false} />
      <Slider
        label="Surface proportion (width : height)"
        min={0}
        max={1}
        step={0.001}
        value={(Math.log(area.surfaceAspect) - logMin) / (logMax - logMin)}
        format={() => `${area.surfaceAspect.toFixed(2)} : 1`}
        onStart={() => dispatch({ type: 'checkpoint' })}
        onChange={(v) => dispatch({ type: 'set-surface-aspect', value: Math.exp(logMin + v * (logMax - logMin)) })}
        hint="Estimated from the photo. If round shapes in the design look squashed or stretched, adjust this. It is a visual setting, not a measurement."
      />
      <Button icon="fit" onClick={() => dispatch({ type: 'reset-perspective' })}>
        Reset frame to the outline
      </Button>
    </div>
  );
}

function ArtworkTab({ area, catalog, dispatch, uploads, onUploadArtwork, uploadBusy, uploadError, onRemoveUpload, artworkStatus, artworkAspect }: Props) {
  const artCategories = catalog.categories.filter((c) => c.kind === 'artwork' && catalog.artwork.some((a) => a.categoryId === c.id));
  const hasUncategorised = catalog.artwork.some((a) => !a.categoryId);
  const [filter, setFilter] = useState<string>('all');
  const items: ArtworkItem[] = useMemo(() => {
    if (filter === 'all') return catalog.artwork;
    if (filter === 'other') return catalog.artwork.filter((a) => !a.categoryId);
    if (filter === 'uploads') return [];
    return catalog.artwork.filter((a) => a.categoryId === filter);
  }, [catalog.artwork, filter]);
  const p = area.placement;
  const logMin = Math.log(MIN_SCALE);
  const logMax = Math.log(MAX_SCALE);
  const choose = (key: string) => dispatch({ type: 'set-artwork', key, artworkAspect: artworkAspect(key) });
  const aspect = area.artworkKey ? artworkAspect(area.artworkKey) : null;

  return (
    <div className="rv-stack">
      <div className="rv-row rv-row--between">
        <h3 className="rv-subhead">Choose artwork</h3>
        <UploadButton label="Upload artwork" onFile={onUploadArtwork} busy={uploadBusy} />
      </div>
      <p className="rv-hint">{SUPPORTED_FORMATS_LABEL}. Your files stay in this browser and are not uploaded to the website.</p>
      {uploadError && <Notice tone="error">{uploadError}</Notice>}

      <div className="rv-chips" role="group" aria-label="Artwork categories">
        {[
          { id: 'all', name: 'All' },
          ...artCategories.map((c) => ({ id: c.id, name: c.name })),
          ...(hasUncategorised && artCategories.length ? [{ id: 'other', name: 'Other' }] : []),
          ...(uploads.length ? [{ id: 'uploads', name: `Your uploads (${uploads.length})` }] : []),
        ].map((c) => (
          <button key={c.id} type="button" className={`rv-chip${filter === c.id ? ' is-active' : ''}`} aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="rv-thumbs" role="listbox" aria-label="Artwork" aria-activedescendant={area.artworkKey ? `rv-art-${area.artworkKey}` : undefined}>
        {(filter === 'all' || filter === 'uploads') &&
          uploads.map((u) => {
            const key = `upload:${u.id}`;
            return (
              <div key={key} className="rv-thumb-wrap">
                <button
                  type="button"
                  id={`rv-art-${key}`}
                  role="option"
                  aria-selected={area.artworkKey === key}
                  className={`rv-thumb${area.artworkKey === key ? ' is-selected' : ''}`}
                  onClick={() => choose(key)}
                >
                  <img src={u.thumb} alt="" />
                  <span>{u.name}</span>
                </button>
                <button type="button" className="rv-thumb__remove" aria-label={`Remove uploaded artwork ${u.name}`} onClick={() => onRemoveUpload(u.id)}>
                  <Icon name="close" size={12} />
                </button>
              </div>
            );
          })}
        {items.map((a) => (
          <LibraryThumb key={a.id} item={a} selected={area.artworkKey === `library:${a.id}`} onChoose={() => choose(`library:${a.id}`)} />
        ))}
        {filter !== 'uploads' && items.length === 0 && catalog.artwork.length === 0 && (
          <p className="rv-empty rv-thumbs__empty">The artwork library is empty. Upload your own design to preview it.</p>
        )}
        {filter !== 'uploads' && filter !== 'all' && items.length === 0 && catalog.artwork.length > 0 && <p className="rv-empty rv-thumbs__empty">No artwork in this category yet.</p>}
      </div>

      {artworkStatus.state === 'loading' && (
        <p className="rv-hint" role="status">
          <span className="rv-spinner rv-spinner--sm" aria-hidden="true" /> Loading artwork…
        </p>
      )}
      {artworkStatus.state === 'error' && (
        <Notice tone="error">
          {artworkStatus.message}{' '}
          <button type="button" className="rv-link" onClick={artworkStatus.retry}>
            Try again
          </button>
        </Notice>
      )}

      {area.artworkKey && (
        <>
          <h3 className="rv-subhead">Size and position</h3>
          <p className="rv-hint">Drag the design on the photo to move it. Pinch, or hold Ctrl/⌘ and scroll, to resize. The dashed line shows the whole design; anything outside the outline is cropped.</p>
          <div className="rv-row">
            <Button icon="fit" onClick={() => aspect && dispatch({ type: 'fit-artwork', mode: 'contain', artworkAspect: aspect })} disabled={!aspect}>
              Show whole design
            </Button>
            <Button icon="square" onClick={() => aspect && dispatch({ type: 'fit-artwork', mode: 'cover', artworkAspect: aspect })} disabled={!aspect}>
              Fill area
            </Button>
          </div>
          <Slider
            label="Design size"
            min={0}
            max={1}
            step={0.001}
            value={(Math.log(p.scale) - logMin) / (logMax - logMin)}
            format={() => pctFmt(p.scale)}
            hint="100% = the design is as tall as the perspective frame. Visual scale only, not print dimensions."
            onStart={() => dispatch({ type: 'checkpoint' })}
            onChange={(v) => dispatch({ type: 'set-placement', patch: { scale: Math.exp(logMin + v * (logMax - logMin)) } })}
          />
          <Slider
            label="Horizontal position"
            min={-0.5}
            max={1.5}
            step={0.001}
            value={p.offsetX}
            format={pctFmt}
            onStart={() => dispatch({ type: 'checkpoint' })}
            onChange={(v) => dispatch({ type: 'set-placement', patch: { offsetX: v } })}
          />
          <Slider
            label="Vertical position"
            min={-0.5}
            max={1.5}
            step={0.001}
            value={p.offsetY}
            format={pctFmt}
            onStart={() => dispatch({ type: 'checkpoint' })}
            onChange={(v) => dispatch({ type: 'set-placement', patch: { offsetY: v } })}
          />
          <Slider
            label="Rotation"
            min={0}
            max={359}
            step={1}
            value={Math.round(p.rotation)}
            format={(v) => `${v}°`}
            onStart={() => dispatch({ type: 'checkpoint' })}
            onChange={(v) => dispatch({ type: 'set-placement', patch: { rotation: v } })}
          />
          <div className="rv-row">
            <Button icon="rotate" onClick={() => dispatch({ type: 'set-placement', patch: { rotation: (Math.round(p.rotation / 90) * 90 + 90) % 360 }, checkpoint: true })}>
              Rotate 90°
            </Button>
          </div>
          <Toggle
            label="Repeat design as a pattern"
            checked={p.repeat}
            onChange={(v) => dispatch({ type: 'set-placement', patch: { repeat: v }, checkpoint: true })}
            hint="Off by default: a single design runs continuously across the surface, including across tile joints."
          />
        </>
      )}
    </div>
  );
}

function LibraryThumb({ item, selected, onChoose }: { item: ArtworkItem; selected: boolean; onChoose: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="rv-thumb-wrap">
      <button type="button" id={`rv-art-library:${item.id}`} role="option" aria-selected={selected} className={`rv-thumb${selected ? ' is-selected' : ''}`} onClick={onChoose}>
        {failed ? (
          <span className="rv-thumb__missing">
            <Icon name="image" />
            Image unavailable
          </span>
        ) : (
          <img src={item.thumbnailUrl ?? item.imageUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
        )}
        <span>{item.title}</span>
      </button>
    </div>
  );
}

function swatchStyle(m: MaterialItem | null): CSSProperties {
  const p = effectiveMaterial(m, { brightness: 0, saturation: 1, opacity: 1, shading: null, gridDensity: null });
  const base = p.tintStrength > 0 ? p.tint : '#c9c4ba';
  const layers: string[] = [];
  if (p.gloss > 0.2) layers.push(`linear-gradient(120deg, transparent 30%, rgba(255,255,255,${(p.gloss * 0.7).toFixed(2)}) 45%, transparent 60%)`);
  if (p.texture === 'brushed') layers.push('repeating-linear-gradient(0deg, rgba(0,0,0,.06) 0 1px, rgba(255,255,255,.08) 1px 2px)');
  if (p.texture === 'tile-grid' || p.texture === 'glass-block') layers.push(`linear-gradient(${p.groutColor} 0 0) 50% 0/2px 100% no-repeat, linear-gradient(${p.groutColor} 0 0) 0 50%/100% 2px no-repeat`);
  if (p.texture === 'frosted') layers.push('radial-gradient(rgba(255,255,255,.55), rgba(255,255,255,.25))');
  return {
    background: `${layers.length ? layers.join(', ') + ', ' : ''}linear-gradient(135deg, #e07a5f, #3d405b 60%, #81b29a)`,
    opacity: Math.max(0.45, p.opacity),
    boxShadow: `inset 0 0 0 999px ${base}${Math.round((p.tintStrength * 0.5) * 255).toString(16).padStart(2, '0')}`,
  };
}

function MaterialTab({ area, catalog, dispatch }: Props) {
  const material = catalog.materials.find((m) => m.id === area.materialId) ?? null;
  const groups = useMemo(() => {
    const cats = catalog.categories.filter((c) => c.kind === 'material');
    const out = cats.map((c) => ({ id: c.id, name: c.name, items: catalog.materials.filter((m) => m.categoryId === c.id) })).filter((g) => g.items.length);
    const other = catalog.materials.filter((m) => !m.categoryId || !cats.some((c) => c.id === m.categoryId));
    if (other.length) out.push({ id: 'other', name: cats.length ? 'Other' : 'Materials', items: other });
    return out;
  }, [catalog]);
  const eff = effectiveMaterial(material, area.appearance);
  const ap = area.appearance;
  const hasGrid = eff.texture === 'tile-grid' || eff.texture === 'glass-block';
  const start = () => dispatch({ type: 'checkpoint' });

  return (
    <div className="rv-stack">
      <fieldset className="rv-materials">
        <legend className="rv-subhead">Print surface</legend>
        <label className={`rv-material${!area.materialId ? ' is-selected' : ''}`}>
          <input type="radio" name={`mat-${area.id}`} checked={!area.materialId} onChange={() => dispatch({ type: 'set-material', materialId: null })} />
          <span className="rv-material__swatch" style={swatchStyle(null)} aria-hidden="true" />
          <span>
            <span className="rv-material__name">Plain print</span>
            <span className="rv-material__desc">No surface effect</span>
          </span>
        </label>
        {groups.map((g) => (
          <div key={g.id} className="rv-material-group">
            <p className="rv-material-group__name">{g.name}</p>
            {g.items.map((m) => (
              <label key={m.id} className={`rv-material${area.materialId === m.id ? ' is-selected' : ''}`}>
                <input type="radio" name={`mat-${area.id}`} checked={area.materialId === m.id} onChange={() => dispatch({ type: 'set-material', materialId: m.id })} />
                {m.thumbnailUrl ? (
                  <img className="rv-material__swatch" src={m.thumbnailUrl} alt="" loading="lazy" />
                ) : (
                  <span className="rv-material__swatch" style={swatchStyle(m)} aria-hidden="true" />
                )}
                <span>
                  <span className="rv-material__name">{m.name}</span>
                  {m.description && <span className="rv-material__desc">{m.description}</span>}
                </span>
              </label>
            ))}
          </div>
        ))}
        {catalog.materials.length === 0 && <p className="rv-empty">No materials have been added to the library yet.</p>}
      </fieldset>

      <h3 className="rv-subhead">Appearance of this area</h3>
      <Slider
        label="Print brightness"
        min={-1}
        max={1}
        step={0.01}
        value={ap.brightness}
        format={(v) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2))}
        onStart={start}
        onChange={(v) => dispatch({ type: 'set-appearance', patch: { brightness: v } })}
      />
      <Slider label="Colour intensity" min={0} max={2} step={0.01} value={ap.saturation} format={pctFmt} onStart={start} onChange={(v) => dispatch({ type: 'set-appearance', patch: { saturation: v } })} />
      <Slider
        label="Opacity"
        min={0.1}
        max={1}
        step={0.01}
        value={ap.opacity}
        format={(v) => pctFmt(v * (material?.params.opacity ?? 1))}
        hint="Lower values let the surface behind show through, e.g. for clear glass."
        onStart={start}
        onChange={(v) => dispatch({ type: 'set-appearance', patch: { opacity: v } })}
      />
      <Slider
        label="Room light and shadow on the print"
        min={0}
        max={1}
        step={0.01}
        value={eff.shading}
        format={pctFmt}
        hint="Keeps shadows and lighting from the photo on the printed surface."
        onStart={start}
        onChange={(v) => dispatch({ type: 'set-appearance', patch: { shading: v } })}
      />
      {hasGrid && (
        <Slider
          label={eff.texture === 'glass-block' ? 'Blocks across the frame height' : 'Tiles across the frame height'}
          min={1}
          max={20}
          step={0.5}
          value={eff.gridDensity}
          format={(v) => v.toFixed(1)}
          hint="Visual joint spacing for the preview. Confirm real tile sizes with us."
          onStart={start}
          onChange={(v) => dispatch({ type: 'set-appearance', patch: { gridDensity: v } })}
        />
      )}
      <Button variant="ghost" icon="undo" onClick={() => dispatch({ type: 'reset-appearance' })}>
        Reset to material defaults
      </Button>
      <p className="rv-hint">Material and lighting effects are preview approximations, not an exact rendering of the finished product.</p>
    </div>
  );
}
