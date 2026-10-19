import { useEffect, useRef, useState } from 'react';
import { Button, IconButton, Notice } from './controls';
import { Icon } from './icons';

/**
 * Shows the rendered preview image with download and (where the device supports it) share.
 * Embedded pages may block downloads, so the image itself is always shown and can be saved
 * with right-click / long-press as a fallback.
 */
export function ExportDialog({
  open,
  onClose,
  state,
  fileName,
}: {
  open: boolean;
  onClose: () => void;
  state: { status: 'working' } | { status: 'ready'; blob: Blob } | { status: 'error'; message: string };
  fileName: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const blob = state.status === 'ready' ? state.blob : null;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  const file = blob ? new File([blob], fileName, { type: 'image/jpeg' }) : null;
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  const share = async () => {
    if (!file) return;
    setShareError(null);
    try {
      await navigator.share({ files: [file], title: 'Room preview' });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setShareError('Sharing is not available here. Download the image instead.');
    }
  };

  return (
    <dialog ref={ref} className="rv-dialog rv-dialog--export" aria-labelledby="rv-export-title" onClose={onClose} onCancel={onClose}>
      <div className="rv-dialog__inner">
        <header className="rv-dialog__head">
          <h2 id="rv-export-title">
            <Icon name="download" size={16} /> Save the preview
          </h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </header>
        <div className="rv-export__frame">
          {state.status === 'working' && (
            <p className="rv-export__status" role="status">
              <span className="rv-spinner" aria-hidden="true" /> Rendering at full photo resolution…
            </p>
          )}
          {state.status === 'error' && <Notice tone="error">{state.message}</Notice>}
          {url && <img src={url} alt="Rendered room preview with the selected designs and finishes" className="rv-export__img" />}
        </div>
        <div className="rv-row rv-row--between">
          <p className="rv-hint">JPEG at the photo&rsquo;s working resolution. Colours, finishes and sizes are approximate. If the download does not start, right-click or long-press the image to save it.</p>
          <div className="rv-row rv-row--nowrap">
            {canShare && (
              <Button icon="upload" onClick={share}>
                Share
              </Button>
            )}
            {url ? (
              <a className="rv-btn rv-btn--primary" href={url} download={fileName}>
                <Icon name="download" />
                <span>Download JPEG</span>
              </a>
            ) : (
              <Button variant="primary" icon="download" disabled onClick={() => undefined}>
                Download JPEG
              </Button>
            )}
          </div>
        </div>
        {shareError && <Notice tone="warning">{shareError}</Notice>}
      </div>
    </dialog>
  );
}
