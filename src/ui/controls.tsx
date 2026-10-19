import { useId, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';

export function IconButton({
  icon,
  label,
  onClick,
  disabled,
  pressed,
  tone,
  showLabel,
  className,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  tone?: 'danger';
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`rv-iconbtn${tone ? ` rv-iconbtn--${tone}` : ''}${showLabel ? ' rv-iconbtn--labelled' : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={showLabel ? undefined : label}
      title={label}
    >
      <Icon name={icon} />
      {showLabel && <span>{label}</span>}
    </button>
  );
}

export function Button({
  children,
  onClick,
  icon,
  variant = 'secondary',
  disabled,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button type="button" className={`rv-btn rv-btn--${variant}${className ? ` ${className}` : ''}`} onClick={onClick} disabled={disabled}>
      {icon && <Icon name={icon} />}
      <span>{children}</span>
    </button>
  );
}

/**
 * Labelled range input. `onCommit` fires once when a drag/keyboard change finishes so callers
 * can record a single undo step per adjustment.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  onStart,
  format,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onStart?: () => void;
  format?: (v: number) => string;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const shown = format ? format(value) : String(value);
  return (
    <div className="rv-slider" style={{ '--rv-fill': `${(((value - min) / (max - min || 1)) * 100).toFixed(1)}%` } as CSSProperties}>
      <div className="rv-slider__head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="rv-num">
          {shown}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={shown}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onPointerDown={onStart}
        onKeyDown={(e) => {
          if (onStart && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key) && !e.repeat) onStart();
        }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && (
        <p id={`${id}-hint`} className="rv-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="rv-toggle">
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>
        <span className="rv-toggle__track" aria-hidden="true" />
        {label}
      </label>
      {hint && <p className="rv-hint">{hint}</p>}
    </div>
  );
}

/** Four-way nudge pad: precise, keyboard- and touch-friendly alternative to dragging a handle. */
export function NudgePad({ onNudge, label }: { onNudge: (dx: number, dy: number, big: boolean) => void; label: string }) {
  const dirs: [IconName, string, number, number][] = [
    ['up', 'up', 0, -1],
    ['left', 'left', -1, 0],
    ['right', 'right', 1, 0],
    ['down', 'down', 0, 1],
  ];
  return (
    <div className="rv-nudge" role="group" aria-label={label}>
      {dirs.map(([icon, word, dx, dy]) => (
        <button
          key={word}
          type="button"
          className={`rv-nudge__btn rv-nudge__btn--${word}`}
          aria-label={`Move ${word}`}
          title={`Move ${word} (hold Shift for bigger steps)`}
          onClick={(e) => onNudge(dx, dy, e.shiftKey)}
        >
          <Icon name={icon} size={16} />
        </button>
      ))}
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'info' | 'error' | 'warning'; children: ReactNode }) {
  return (
    <div className={`rv-notice rv-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={tone === 'info' ? 'info' : 'alert'} size={16} />
      <div>{children}</div>
    </div>
  );
}
