import type { Dispatch } from 'react';
import type { Action } from '../state/editor';
import type { Lighting } from '../state/types';
import { Slider } from './controls';

const PRESETS: { name: string; value: Lighting }[] = [
  { name: 'As photographed', value: { exposure: 0, warmth: 0 } },
  { name: 'Bright daylight', value: { exposure: 0.35, warmth: -0.35 } },
  { name: 'Warm evening', value: { exposure: -0.25, warmth: 0.7 } },
  { name: 'Dim', value: { exposure: -0.7, warmth: 0.2 } },
];

export function LightingPanel({ lighting, dispatch }: { lighting: Lighting; dispatch: Dispatch<Action> }) {
  return (
    <section className="rv-section" aria-labelledby="rv-light-title">
      <header className="rv-section__head">
        <h2 id="rv-light-title">
          <span className="rv-step" aria-hidden="true">
            03
          </span>
          Scene lighting
        </h2>
      </header>
      <div className="rv-chips" role="group" aria-label="Lighting presets">
        {PRESETS.map((p) => {
          const active = Math.abs(p.value.exposure - lighting.exposure) < 0.01 && Math.abs(p.value.warmth - lighting.warmth) < 0.01;
          return (
            <button key={p.name} type="button" className={`rv-chip${active ? ' is-active' : ''}`} aria-pressed={active} onClick={() => dispatch({ type: 'set-lighting', patch: p.value })}>
              {p.name}
            </button>
          );
        })}
      </div>
      <Slider
        label="Brightness"
        min={-1}
        max={1}
        step={0.01}
        value={lighting.exposure}
        format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} EV`}
        onChange={(v) => dispatch({ type: 'set-lighting', patch: { exposure: v } })}
      />
      <Slider
        label="Warmth"
        min={-1}
        max={1}
        step={0.01}
        value={lighting.warmth}
        format={(v) => (Math.abs(v) < 0.005 ? 'Neutral' : v > 0 ? `Warm ${Math.round(v * 100)}` : `Cool ${Math.round(-v * 100)}`)}
        onChange={(v) => dispatch({ type: 'set-lighting', patch: { warmth: v } })}
      />
      <p className="rv-hint">Adjusts the look of the whole photo and every print together. It is a preview adjustment, not a lighting simulation.</p>
    </section>
  );
}
