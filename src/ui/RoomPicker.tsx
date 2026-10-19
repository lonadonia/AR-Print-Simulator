import { useEffect, useMemo, useRef, useState } from 'react';
import type { Catalog, SceneItem } from '../catalog/types';
import { SUPPORTED_FORMATS_LABEL } from '../imaging/loadImage';
import { IconButton, Notice } from './controls';
import { Icon } from './icons';
import { UploadButton } from './UploadButton';

export interface UploadedRoom {
  id: string;
  name: string;
  thumb: string;
}

export function RoomPicker({
  open,
  onClose,
  catalog,
  currentKey,
  uploads,
  onChoose,
  onUpload,
  onRemoveUpload,
  uploadBusy,
  uploadError,
}: {
  open: boolean;
  onClose: () => void;
  catalog: Catalog;
  currentKey: string | null;
  uploads: UploadedRoom[];
  onChoose: (key: string) => void;
  onUpload: (file: File) => void;
  onRemoveUpload: (id: string) => void;
  uploadBusy: boolean;
  uploadError: string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const cats = useMemo(() => catalog.categories.filter((c) => c.kind === 'room' && catalog.scenes.some((s) => s.categoryId === c.id)), [catalog]);
  const scenes: SceneItem[] = filter === 'all' ? catalog.scenes : catalog.scenes.filter((s) => s.categoryId === filter);

  return (
    <dialog ref={ref} className="rv-dialog" aria-labelledby="rv-room-title" onClose={onClose} onCancel={onClose}>
      <div className="rv-dialog__inner">
        <header className="rv-dialog__head">
          <h2 id="rv-room-title">
            <span className="rv-step" aria-hidden="true">
              01
            </span>
            Choose a room
          </h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </header>

        <div className="rv-uploadcard">
          <div>
            <p className="rv-uploadcard__title">Use a photo of your own space</p>
            <p className="rv-hint">
              {SUPPORTED_FORMATS_LABEL}. Take it straight on or at a gentle angle, in good light. The photo is processed only in this browser and is not uploaded to the website.
            </p>
          </div>
          <UploadButton label="Upload room photo" onFile={onUpload} busy={uploadBusy} variant="primary" />
        </div>
        {uploadError && <Notice tone="error">{uploadError}</Notice>}

        {uploads.length > 0 && (
          <>
            <h3 className="rv-subhead">Your photos</h3>
            <div className="rv-roomgrid">
              {uploads.map((u) => {
                const key = `upload-room:${u.id}`;
                return (
                  <div key={key} className="rv-thumb-wrap">
                    <button type="button" className={`rv-room${currentKey === key ? ' is-selected' : ''}`} aria-pressed={currentKey === key} onClick={() => onChoose(key)}>
                      <img src={u.thumb} alt="" />
                      <span>{u.name}</span>
                    </button>
                    <button type="button" className="rv-thumb__remove" aria-label={`Remove photo ${u.name}`} onClick={() => onRemoveUpload(u.id)}>
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <h3 className="rv-subhead">Sample rooms</h3>
        {catalog.scenes.length === 0 ? (
          <p className="rv-empty">No sample rooms are available right now. Upload a photo of your own space to start.</p>
        ) : (
          <>
            {cats.length > 1 && (
              <div className="rv-chips" role="group" aria-label="Room categories">
                {[{ id: 'all', name: 'All rooms' }, ...cats].map((c) => (
                  <button key={c.id} type="button" className={`rv-chip${filter === c.id ? ' is-active' : ''}`} aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <div className="rv-roomgrid">
              {scenes.map((s) => (
                <RoomThumb key={s.id} scene={s} selected={currentKey === `scene:${s.id}`} onChoose={() => onChoose(`scene:${s.id}`)} />
              ))}
            </div>
          </>
        )}
        <p className="rv-hint">Print areas you draw are kept separately for each room while this page is open, so switching rooms never moves them onto another photo.</p>
      </div>
    </dialog>
  );
}

function RoomThumb({ scene, selected, onChoose }: { scene: SceneItem; selected: boolean; onChoose: () => void }) {
  const [src, setSrc] = useState<string | null>(scene.thumbnailUrl ?? scene.imageUrl);
  const failed = src === null;
  return (
    <button type="button" className={`rv-room${selected ? ' is-selected' : ''}`} aria-pressed={selected} onClick={onChoose} title={scene.description || undefined}>
      {failed ? (
        <span className="rv-thumb__missing">
          <Icon name="image" /> Image unavailable
        </span>
      ) : (
        <img src={src} alt="" loading="lazy" onError={() => setSrc((cur) => (cur !== scene.imageUrl ? scene.imageUrl : null))} />
      )}
      <span>{scene.title}</span>
    </button>
  );
}
