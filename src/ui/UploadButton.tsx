import { useRef } from 'react';
import { ACCEPT_ATTRIBUTE } from '../imaging/loadImage';
import { Icon } from './icons';

/** A real button that opens the file picker (keyboard and screen-reader friendly). */
export function UploadButton({
  label,
  onFile,
  busy,
  variant = 'secondary',
  className,
}: {
  label: string;
  onFile: (file: File) => void;
  busy?: boolean;
  variant?: 'primary' | 'secondary';
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={`rv-btn rv-btn--${variant}${className ? ` ${className}` : ''}`} onClick={() => ref.current?.click()} disabled={busy} aria-busy={busy}>
        {busy ? <span className="rv-spinner rv-spinner--sm" aria-hidden="true" /> : <Icon name="upload" />}
        <span>{busy ? 'Reading image…' : label}</span>
      </button>
      <input
        ref={ref}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="rv-visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
    </>
  );
}
