import { useEffect, useRef } from 'react';
import { IconButton } from './controls';
import { Icon } from './icons';

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Tools',
    items: [
      ['V', 'Select and edit'],
      ['W', 'Magic select a surface'],
      ['P', 'Pen — outline point by point'],
      ['R', 'Rectangle'],
      ['H  or hold Space', 'Hand — pan the zoomed photo'],
      ['Esc', 'Cancel the current tool'],
    ],
  },
  {
    title: 'Precision',
    items: [
      ['S', 'Snapping on / off'],
      ['Alt (while placing)', 'Place without snapping'],
      ['Shift (Pen)', 'Constrain to 15° steps'],
      ['L', 'Magnifier while dragging'],
      ['Arrow keys', 'Move the focused point 1 px'],
      ['Shift + arrows', 'Move the focused point 10 px'],
      ['Delete', 'Remove the focused point'],
    ],
  },
  {
    title: 'View',
    items: [
      ['Ctrl/⌘ + scroll', 'Zoom at the cursor'],
      ['+  /  −  /  0', 'Zoom in / out / fit'],
      ['B', 'Before / after comparison'],
      ['F', 'Perspective frame of the selected area'],
      ['Alt + scroll (Artwork)', 'Resize the design'],
    ],
  },
  {
    title: 'History',
    items: [
      ['Ctrl/⌘ + Z', 'Undo'],
      ['Ctrl/⌘ + Shift + Z', 'Redo'],
      ['Enter (Pen)', 'Finish the outline'],
    ],
  },
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="rv-dialog rv-dialog--keys" aria-labelledby="rv-keys-title" onClose={onClose} onCancel={onClose}>
      <div className="rv-dialog__inner">
        <header className="rv-dialog__head">
          <h2 id="rv-keys-title">
            <Icon name="keyboard" size={16} /> Keyboard shortcuts
          </h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </header>
        <div className="rv-keys">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="rv-subhead">{g.title}</h3>
              <dl>
                {g.items.map(([k, v]) => (
                  <div key={k} className="rv-keys__row">
                    <dt>
                      <kbd>{k}</kbd>
                    </dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="rv-hint">On touch screens: tap to place points, drag points with a magnifier, pinch the design to resize it and double-tap the photo to zoom.</p>
      </div>
    </dialog>
  );
}
