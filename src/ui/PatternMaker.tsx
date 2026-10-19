import { useEffect, useMemo, useRef, useState } from 'react';
import { COLOURWAYS, PATTERN_GROUPS, PATTERNS, parsePatternKey, renderPattern, type Palette, type PatternDef, type PatternGroup } from '../patterns/patterns';

const THUMB_W = 192;
const THUMB_H = 120;
const thumbCache = new Map<string, string>();

/** Small preview: tile patterns are shown repeated a few times, panels are cover-fitted. */
function patternThumb(def: PatternDef, colors: Palette): string {
  const key = `${def.id}|${colors.join('')}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = THUMB_W;
  c.height = THUMB_H;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  if (def.tile) {
    const tile = renderPattern(def, colors, Math.round(THUMB_W / 2.4));
    const pat = ctx.createPattern(tile, 'repeat');
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, THUMB_W, THUMB_H);
    }
  } else {
    const panel = renderPattern(def, colors, 384);
    const s = Math.max(THUMB_W / panel.width, THUMB_H / panel.height);
    ctx.drawImage(panel, (THUMB_W - panel.width * s) / 2, (THUMB_H - panel.height * s) / 2, panel.width * s, panel.height * s);
  }
  const url = c.toDataURL('image/png');
  if (thumbCache.size > 400) thumbCache.clear();
  thumbCache.set(key, url);
  return url;
}

const COLOR_LABELS = ['Background', 'Main colour', 'Second colour', 'Accent'] as const;

export function PatternMaker({ currentKey, onApply }: { currentKey: string | null; onApply: (id: string, colors: Palette) => void }) {
  const current = currentKey ? parsePatternKey(currentKey) : null;
  const [palette, setPalette] = useState<Palette>(() => current?.colors ?? COLOURWAYS[0].colors);
  const [group, setGroup] = useState<PatternGroup | 'all'>('all');
  const applyTimer = useRef<number | null>(null);

  // Follow the palette of the pattern on the selected area (e.g. after selecting another area).
  const currentColors = current?.colors.join('');
  useEffect(() => {
    if (current) setPalette(current.colors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentColors]);
  useEffect(() => () => void (applyTimer.current && window.clearTimeout(applyTimer.current)), []);

  const list = useMemo(() => (group === 'all' ? PATTERNS : PATTERNS.filter((p) => p.group === group)), [group]);

  const changePalette = (next: Palette, immediate: boolean) => {
    setPalette(next);
    if (!current) return;
    if (applyTimer.current) window.clearTimeout(applyTimer.current);
    if (immediate) onApply(current.id, next);
    else applyTimer.current = window.setTimeout(() => onApply(current.id, next), 160);
  };

  return (
    <div className="rv-stack rv-patternmaker">
      <p className="rv-hint">Seamless, recolourable patterns generated in the browser. Pick a pattern, then a colourway or your own colours. Use “Design size” below to set the repeat size.</p>

      <div className="rv-chips" role="group" aria-label="Pattern styles">
        {[{ id: 'all' as const, name: 'All' }, ...PATTERN_GROUPS].map((g) => (
          <button key={g.id} type="button" className={`rv-chip${group === g.id ? ' is-active' : ''}`} aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>
            {g.name}
          </button>
        ))}
      </div>

      <div className="rv-thumbs rv-thumbs--patterns" role="listbox" aria-label="Patterns">
        {list.map((def) => {
          const selected = current?.id === def.id;
          return (
            <div key={def.id} className="rv-thumb-wrap">
              <button type="button" role="option" aria-selected={selected} className={`rv-thumb${selected ? ' is-selected' : ''}`} onClick={() => onApply(def.id, palette)}>
                <img src={patternThumb(def, palette)} alt="" />
                <span>{def.name}</span>
              </button>
            </div>
          );
        })}
      </div>

      <fieldset className="rv-colourways">
        <legend className="rv-subhead">Colourway</legend>
        <div className="rv-colourways__grid">
          {COLOURWAYS.map((w) => {
            const active = w.colors.every((c, i) => c === palette[i]);
            return (
              <button key={w.id} type="button" className={`rv-colourway${active ? ' is-active' : ''}`} aria-pressed={active} title={w.name} onClick={() => changePalette(w.colors, true)}>
                <span className="rv-colourway__chips" aria-hidden="true">
                  {w.colors.map((c, i) => (
                    <span key={i} style={{ background: c }} />
                  ))}
                </span>
                <span className="rv-colourway__name">{w.name}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="rv-colours">
        <legend className="rv-subhead">Your colours</legend>
        <div className="rv-colours__grid">
          {COLOR_LABELS.map((label, i) => (
            <label key={label} className="rv-colour">
              <input
                type="color"
                value={palette[i]}
                onChange={(e) => {
                  const next = [...palette] as Palette;
                  next[i] = e.target.value.toLowerCase();
                  changePalette(next, false);
                }}
              />
              <span>
                <span className="rv-colour__label">{label}</span>
                <span className="rv-colour__hex rv-num">{palette[i].toUpperCase()}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="rv-hint">Screen colours differ from printed ink. Ask us for a printed sample to confirm a colour.</p>
    </div>
  );
}
