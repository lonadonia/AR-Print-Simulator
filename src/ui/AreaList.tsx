import type { Dispatch } from 'react';
import type { Action } from '../state/editor';
import { areaValidity } from '../state/selectors';
import type { EditorState, PrintArea, SceneDoc } from '../state/types';
import { IconButton } from './controls';
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
  const active = (kind: 'draw' | 'magic') => state.tool.kind === kind && state.tool.target === 'area';
  return (
    <section className="rv-section" aria-labelledby="rv-areas-title">
      <header className="rv-section__head">
        <h2 id="rv-areas-title">
          <span className="rv-step" aria-hidden="true">
            02
          </span>
          Print areas
        </h2>
        <span className="rv-section__count rv-num">{doc.areas.length}</span>
      </header>
      <div className="rv-addbar" role="group" aria-label="Add a print area">
        <button type="button" className={`rv-btn rv-btn--primary${active('magic') ? ' is-active' : ''}`} aria-pressed={active('magic')} onClick={() => dispatch({ type: 'set-tool', tool: 'magic', target: 'area' })} title="Tap a surface on the photo (W)">
          <Icon name="wand" />
          <span>Magic select</span>
        </button>
        <button type="button" className={`rv-btn${active('draw') ? ' is-active' : ''}`} aria-pressed={active('draw')} onClick={() => dispatch({ type: 'set-tool', tool: 'pen', target: 'area' })} title="Click each corner of the surface (P)">
          <Icon name="pen" />
          <span>Draw area</span>
        </button>
        <IconButton icon="square" label="Add rectangle area" onClick={() => dispatch({ type: 'add-rect-area' })} className="rv-iconbtn--boxed" />
      </div>
      {doc.areas.length === 0 ? (
        <div className="rv-empty rv-empty--areas">
          <p>No print areas yet.</p>
          <ol className="rv-howto">
            <li>
              <Icon name="wand" size={15} /> <strong>Magic select</strong> — tap a wall, door or glass panel and its outline is found for you.
            </li>
            <li>
              <Icon name="pen" size={15} /> <strong>Draw area</strong> — click each corner; points snap to edges in the photo.
            </li>
            <li>
              <Icon name="square" size={15} /> <strong>Rectangle</strong> — add one and drag its corners into place.
            </li>
          </ol>
        </div>
      ) : (
        <ol className="rv-arealist">
          {doc.areas.map((a, i) => {
            const v = areaValidity(a, doc.aspect);
            const art = describeArtwork(a);
            const mat = describeMaterial(a);
            const isSel = a.id === state.selectedAreaId;
            const problem = v.boundary || v.perspective || v.cutouts.some(Boolean);
            return (
              <li key={a.id} className={`rv-arealist__item${isSel ? ' is-selected' : ''}${a.hidden ? ' is-hidden' : ''}`}>
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
                <button
                  type="button"
                  className="rv-arealist__eye"
                  aria-pressed={!a.hidden}
                  aria-label={a.hidden ? `Show ${a.name} in the preview` : `Hide ${a.name} in the preview`}
                  title={a.hidden ? 'Hidden — click to show' : 'Visible — click to hide'}
                  onClick={() => dispatch({ type: 'toggle-hidden', id: a.id })}
                >
                  <Icon name={a.hidden ? 'eye-off' : 'eye'} size={16} />
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
