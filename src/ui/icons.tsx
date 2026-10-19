import type { SVGProps } from 'react';

/** Small inline icon set (24×24, stroke based). Decorative: always paired with a text label or aria-label. */
type IconName =
  | 'image'
  | 'upload'
  | 'plus'
  | 'pen'
  | 'square'
  | 'trash'
  | 'copy'
  | 'undo'
  | 'redo'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'close'
  | 'check'
  | 'alert'
  | 'sun'
  | 'rotate'
  | 'repeat'
  | 'scissors'
  | 'frame'
  | 'layers'
  | 'palette'
  | 'shape'
  | 'chevron-down'
  | 'info'
  | 'camera'
  | 'bolt'
  | 'switch'
  | 'cursor'
  | 'wand'
  | 'hand'
  | 'magnet'
  | 'loupe'
  | 'compare'
  | 'download'
  | 'eye'
  | 'eye-off'
  | 'keyboard'
  | 'move'
  | 'sparkle'
  | 'tile';

const PATHS: Record<IconName, string> = {
  image: 'M4 5h16v14H4z M4 16l4.5-4.5 3.5 3.5 2.5-2.5L20 17 M15.5 9.5a1 1 0 1 0 0-.01',
  upload: 'M12 16V4 M7 9l5-5 5 5 M5 20h14',
  plus: 'M12 5v14 M5 12h14',
  pen: 'M4 20l4-1 11-11-3-3L5 16z M14 6l3 3',
  square: 'M5 5h14v14H5z',
  trash: 'M5 7h14 M10 7V4h4v3 M7 7l1 13h8l1-13',
  copy: 'M8 8h11v11H8z M5 16V5h11',
  undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
  'zoom-in': 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M20 20l-4.8-4.8 M10.5 7.5v6 M7.5 10.5h6',
  'zoom-out': 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M20 20l-4.8-4.8 M7.5 10.5h6',
  fit: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  up: 'M12 19V5 M6 11l6-6 6 6',
  down: 'M12 5v14 M6 13l6 6 6-6',
  left: 'M19 12H5 M11 6l-6 6 6 6',
  right: 'M5 12h14 M13 6l6 6-6 6',
  close: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 4l9 16H3z M12 10v4 M12 17v.5',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  rotate: 'M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7',
  repeat: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.5 7.5L20 18 M8.5 16.5L20 6',
  frame: 'M3 7h18 M3 17h18 M7 3v18 M17 3v18',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  palette: 'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2 0-1.5-1.5-2 0-3.5 1-1 3-.5 4-1.5 2-2 2-11-6-11z M7.5 11.5v.01 M10 7.5v.01 M15 7.5v.01',
  shape: 'M4 6l7-2 9 5-3 10-11 1z',
  'chevron-down': 'M6 9l6 6 6-6',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v6 M12 7.5v.5',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  switch: 'M4 9h13l-3-3 M20 15H7l3 3',
  cursor: 'M5 3l13 8-6 1.5L9 19z',
  wand: 'M4 20L15 9 M13 7l2-2 2 2-2 2z M19 3v3 M17.5 4.5h3 M20 11v2 M19 12h2 M9 3v2 M8 4h2',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12 M11 11V4.5a1.5 1.5 0 0 1 3 0V12 M14 11V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 4 15.5l-.6-2.4a1.5 1.5 0 0 1 2.7-1.2L8 15',
  magnet: 'M6 3v8a6 6 0 0 0 12 0V3 M6 7h4 M14 7h4 M10 3v8a2 2 0 0 0 4 0V3',
  loupe: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M21 21l-6-6 M10 7v6 M7 10h6',
  compare: 'M12 3v18 M4 6h5v12H4z M15 6h5v12h-5z',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'eye-off': 'M3 3l18 18 M10.6 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2 M6.3 6.3C3.7 8 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.7-1.2 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  keyboard: 'M3 7h18v10H3z M7 11h.01 M11 11h.01 M15 11h.01 M7 14h10',
  move: 'M12 3v18 M3 12h18 M12 3l-3 3 M12 3l3 3 M12 21l-3-3 M12 21l3-3 M3 12l3-3 M3 12l3 3 M21 12l-3-3 M21 12l-3 3',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  tile: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
};

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export type { IconName };
