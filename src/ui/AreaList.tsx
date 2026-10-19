import type { Dispatch } from 'react';
import type { Action } from '../state/editor';
import { areaValidity } from '../state/selectors';
import type { EditorState, PrintArea, SceneDoc } from '../state/types';
import { Button, IconButton } from './controls';
import { Icon } from './icons';

export function AreaList({
  doc,
  state,
  dispatch,
  describeArtwork,
  describeMaterial,
}: {
  doc: SceneDoc;
  state: EditorState;
  dispatch: Dispatch<Action>;
  describeArtwork: (a: PrintArea) => { title: string; thumb: string | null } | null;
  describeMaterial: (a: PrintArea) => string | null;
}) {
  const drawingArea = state.tool.kind === 'draw' && state.tool.target === 'area';
  return (
    <section className="rv-section" aria-labelledby="rv-areas-title">
      <header className="rv-section__head">
        <h2 id="rv-areas-title">
          <span className="rv-step" aria-hidden="true">
            02
          </span>
          Print areas
        </h2>
        <div className="rv-section__actions">
          <Button icon="pen" onClick={() => dispatch({ type: 'start-draw', target: 'area' })} disabled={drawingArea} variant="primary">
            Draw area
          </Button>
          <IconButton icon="square" label="Add rectangle area" onClick={() => dispatch({ type: 'add-rect-area' })} />
        </div>
      </header>
      {doc.areas.length === 0 ? (
        <p className="rv-empty">
          No print areas yet. Choose <strong>Draw area</strong> and tap around the surface you want printed, or add a rectangle and drag its corners.
        </p>
      ) : (
        <ol className="rv-arealist">
          {doc.areas.map((a, i) => {
            const v = areaValidity(a, doc.aspect);
            const art = describeArtwork(a);
            const mat = describeMaterial(a);
            const isSel = a.id === state.selectedAreaId;
            const problem = v.boundary || v.perspective || v.cutouts.some(Boolean);
            return (
              <li key={a.id} className={`rv-arealist__item${isSel ? ' is-selected' : ''}`}>
                <button
                  type="button"
                  className="rv-arealist__select"
                  onClick={() => dispatch({ type: 'select-area', id: a.id })}
                  aria-pressed={isSel}
                  aria-label={`Area ${i + 1}: ${a.name}${problem ? ' (needs attention)' : ''}`}
                >
                  <span className="rv-arealist__num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="rv-arealist__thumb" aria-hidden="true">
                    {art?.thumb ? <img src={art.thumb} alt="" loading="lazy" /> : <Icon name="image" size={16} />}
                  </span>
                  <span className="rv-arealist__text">
                    <span className="rv-arealist__name">{a.name || `Area ${i + 1}`}</span>
                    <span className="rv-arealist__meta">
                      {problem ? (
                        <span className="rv-warn">
                          <Icon name="alert" size={12} /> Needs attention
                        </span>
                      ) : (
                        <>
                          {art ? art.title : 'No artwork yet'}
                          {mat ? ` · ${mat}` : ''}
                        </>
                      )}
                    </span>
                  </span>
                </button>
                {isSel && (
                  <div className="rv-arealist__tools" role="group" aria-label={`Actions for ${a.name}`}>
                    <IconButton icon="up" label="Move up (draw below)" onClick={() => dispatch({ type: 'reorder-area', id: a.id, direction: -1 })} disabled={i === 0} />
                    <IconButton
                      icon="down"
                      label="Move down (draw on top)"
                      onClick={() => dispatch({ type: 'reorder-area', id: a.id, direction: 1 })}
                      disabled={i === doc.areas.length - 1}
                    />
                    <IconButton icon="copy" label="Duplicate area" onClick={() => dispatch({ type: 'duplicate-area', id: a.id })} />
                    <IconButton icon="trash" label="Delete area" tone="danger" onClick={() => dispatch({ type: 'delete-area', id: a.id })} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {doc.areas.length > 1 && <p className="rv-hint">Where areas overlap, the lower one in this list is drawn on top.</p>}
    </section>
  );
}
