import { describe, expect, it } from 'vitest';
import { DEFAULT_MATERIAL_PARAMS, type MaterialItem } from '../catalog/types';
import type { Point } from '../geometry/polygon';
import { editorReducer, initialState, type Action } from './editor';
import { effectiveMaterial, selectArea, selectDoc } from './selectors';
import type { EditorState } from './types';

const ASPECT = 1.5;
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const run = (actions: Action[], from: EditorState = initialState()) => actions.reduce(editorReducer, from);
const opened = () => run([{ type: 'open-scene', key: 'scene:test', aspect: ASPECT, presets: [] }]);

describe('editor: creating shapes', () => {
  it('adds an area from a magic selection with its holes as cutouts, keeping the tool when asked', () => {
    const s0 = run([{ type: 'set-tool', tool: 'magic', target: 'area' }], opened());
    const s = editorReducer(s0, { type: 'add-shape', target: 'area', boundary: rect(0.1, 0.1, 0.6, 0.6), holes: [rect(0.3, 0.3, 0.4, 0.4)], keepTool: true, notice: 'Selected' });
    const area = selectArea(s)!;
    expect(area.exclusions).toHaveLength(1);
    expect(s.tool.kind).toBe('magic');
    expect(s.notice?.text).toBe('Selected');
    // Pen/rectangle results return to the select tool.
    const s2 = editorReducer(s, { type: 'add-shape', target: 'area', boundary: rect(0.7, 0.1, 0.9, 0.4) });
    expect(s2.tool.kind).toBe('none');
    expect(selectDoc(s2)!.areas).toHaveLength(2);
  });

  it('refuses a cutout when no area is selected and invalid outlines with a message', () => {
    const s = editorReducer(opened(), { type: 'add-shape', target: 'cutout', boundary: rect(0.2, 0.2, 0.3, 0.3) });
    expect(s.notice?.tone).toBe('error');
    const crossed = editorReducer(opened(), {
      type: 'add-shape',
      target: 'area',
      boundary: [
        { x: 0.2, y: 0.2 },
        { x: 0.5, y: 0.5 },
        { x: 0.5, y: 0.2 },
        { x: 0.2, y: 0.5 },
      ],
    });
    expect(selectDoc(crossed)!.areas).toHaveLength(0);
    expect(crossed.notice?.text).toMatch(/crosses itself/);
  });

  it('replaces the outline of the selected area (magic add/subtract) as one undo step', () => {
    let s = run([{ type: 'add-shape', target: 'area', boundary: rect(0.1, 0.1, 0.4, 0.4) }], opened());
    const id = selectArea(s)!.id;
    s = editorReducer(s, { type: 'set-material', materialId: 'mat-x' });
    s = editorReducer(s, { type: 'replace-shape', boundary: rect(0.1, 0.1, 0.7, 0.4), holes: [rect(0.2, 0.2, 0.3, 0.3)] });
    const a = selectArea(s)!;
    expect(a.id).toBe(id);
    expect(a.materialId).toBe('mat-x');
    expect(a.boundary[1].x).toBeCloseTo(0.7);
    expect(a.exclusions).toHaveLength(1);
    s = editorReducer(s, { type: 'undo' });
    expect(selectArea(s)!.boundary[1].x).toBeCloseTo(0.4);
  });
});

describe('editor: editing', () => {
  it('moves the whole outline and keeps it inside the photo', () => {
    let s = run([{ type: 'add-shape', target: 'area', boundary: rect(0.1, 0.1, 0.4, 0.4) }], opened());
    s = editorReducer(s, { type: 'translate-area', dx: 0.2, dy: 0 });
    expect(selectArea(s)!.boundary[0].x).toBeCloseTo(0.3);
    s = editorReducer(s, { type: 'translate-area', dx: 5, dy: 0 });
    expect(Math.max(...selectArea(s)!.boundary.map((p) => p.x))).toBeCloseTo(1);
  });

  it('hides and shows an area', () => {
    let s = run([{ type: 'add-shape', target: 'area', boundary: rect(0.1, 0.1, 0.4, 0.4) }], opened());
    const id = selectArea(s)!.id;
    s = editorReducer(s, { type: 'toggle-hidden', id });
    expect(selectArea(s)!.hidden).toBe(true);
    s = editorReducer(s, { type: 'toggle-hidden', id });
    expect(selectArea(s)!.hidden).toBe(false);
  });

  it('switches the creation target between a new area and a cutout', () => {
    let s = run([{ type: 'set-tool', tool: 'pen' }], opened());
    expect(s.tool).toMatchObject({ kind: 'draw', target: 'area' });
    s = editorReducer(s, { type: 'set-tool-target', target: 'cutout' });
    expect(s.notice?.tone).toBe('error'); // nothing selected yet
    s = run([{ type: 'add-shape', target: 'area', boundary: rect(0.1, 0.1, 0.4, 0.4) }, { type: 'set-tool', tool: 'rect', target: 'cutout' }], s);
    expect(s.tool).toMatchObject({ kind: 'rect', target: 'cutout' });
    expect(s.mode).toBe('cutouts');
  });

  it('applies per-area tile layout overrides on top of the material', () => {
    const material: MaterialItem = {
      id: 'm',
      name: 'Tile',
      categoryId: null,
      thumbnailUrl: null,
      description: '',
      order: 0,
      params: { ...DEFAULT_MATERIAL_PARAMS, texture: 'tile-grid', tileLayout: 'brick', tileAspect: 3 },
    };
    let s = run([{ type: 'add-shape', target: 'area', boundary: rect(0.1, 0.1, 0.4, 0.4) }], opened());
    expect(effectiveMaterial(material, selectArea(s)!.appearance)).toMatchObject({ tileLayout: 'brick', tileAspect: 3 });
    s = editorReducer(s, { type: 'set-appearance', patch: { tileLayout: 'herringbone', tileAspect: 2 } });
    expect(effectiveMaterial(material, selectArea(s)!.appearance)).toMatchObject({ tileLayout: 'herringbone', tileAspect: 2 });
    s = editorReducer(s, { type: 'reset-appearance' });
    expect(effectiveMaterial(material, selectArea(s)!.appearance).tileLayout).toBe('brick');
  });

  it('keeps the placement when recolouring a pattern', () => {
    let s = run([{ type: 'add-shape', target: 'area', boundary: rect(0.1, 0.1, 0.4, 0.4) }], opened());
    s = editorReducer(s, { type: 'set-artwork', key: 'pattern:zellige:aaaaaa-bbbbbb-cccccc-dddddd', artworkAspect: 1, placement: { repeat: true, scale: 0.3 } });
    s = editorReducer(s, { type: 'set-placement', patch: { scale: 0.5, offsetX: 0.2 } });
    s = editorReducer(s, { type: 'set-artwork', key: 'pattern:zellige:111111-222222-333333-444444', artworkAspect: 1, keepPlacement: true, placement: { repeat: true } });
    const p = selectArea(s)!.placement;
    expect(selectArea(s)!.artworkKey).toBe('pattern:zellige:111111-222222-333333-444444');
    expect(p.scale).toBeCloseTo(0.5);
    expect(p.offsetX).toBeCloseTo(0.2);
    expect(p.repeat).toBe(true);
  });
});
