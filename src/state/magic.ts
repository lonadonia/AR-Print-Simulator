import type { Dispatch } from 'react';
import type { Point } from '../geometry/polygon';
import { magicCombine, magicSelect, type PhotoAnalysis } from '../imaging/analysis';
import type { Action } from './editor';
import type { PrintArea, ShapeTarget } from './types';

/** How a magic-select tap is used. */
export type MagicMode = 'new' | 'add' | 'subtract';

export interface MagicSettings {
  /** 0..100 */
  tolerance: number;
  mode: MagicMode;
  /** continue across thin joints (grout, glass-block joints, door gaps) of the same colour */
  joints: boolean;
}

export const DEFAULT_MAGIC: MagicSettings = { tolerance: 30, mode: 'new', joints: true };

const NOTHING = 'No clear surface found there. Raise the tolerance, or outline it with the Pen.';

/**
 * Runs magic selection at a point. `new` creates a print area (holes become obstacle cutouts),
 * `add` / `subtract` reshape the selected area, and a `cutout` target adds an obstacle cutout to
 * the selected area. Returns false when nothing usable was found.
 */
export function applyMagicSelect(
  analysis: PhotoAnalysis,
  p: Point,
  target: ShapeTarget,
  settings: MagicSettings,
  selected: PrintArea | null,
  dispatch: Dispatch<Action>,
): boolean {
  const opts = { tolerance: settings.tolerance, bridgeJoints: settings.joints };
  if (target === 'area' && settings.mode !== 'new' && selected) {
    const out = magicCombine(analysis, { boundary: selected.boundary, holes: selected.exclusions }, p, settings.mode, opts);
    if ('failure' in out) {
      const text =
        out.failure === 'nothing'
          ? NOTHING
          : out.failure === 'disjoint'
            ? 'That surface does not touch the selected area. Choose “New area” to make it a separate area.'
            : 'Nothing would be left of the area. Lower the tolerance or tap another spot.';
      dispatch({ type: 'notify', tone: 'error', text });
      return false;
    }
    const cut = out.result.holes.length;
    dispatch({
      type: 'replace-shape',
      boundary: out.result.boundary,
      holes: out.result.holes,
      notice: settings.mode === 'add' ? 'Added to the area.' : `Removed from the area${cut ? ` · ${cut} cutout${cut === 1 ? '' : 's'}` : ''}.`,
    });
    return true;
  }
  const res = magicSelect(analysis, p, opts);
  if (!res || res.coverage > 0.92) {
    dispatch({ type: 'notify', tone: 'error', text: res ? 'That selection covers almost the whole photo. Lower the tolerance and try again.' : NOTHING });
    return false;
  }
  const isArea = target === 'area';
  const holes = isArea ? res.holes.length : 0;
  dispatch({
    type: 'add-shape',
    target,
    boundary: res.boundary,
    holes: isArea ? res.holes : [],
    perspective: isArea ? res.quad : null,
    // The magic tool stays active so the selection can be extended (Shift) or trimmed (Alt).
    keepTool: true,
    notice: isArea
      ? `Surface selected${holes ? ` with ${holes} obstacle cutout${holes === 1 ? '' : 's'}` : ''}. Shift-tap adds, Alt-tap removes · press V to edit the points.`
      : 'Cutout added. Press V to edit its points.',
  });
  return true;
}
