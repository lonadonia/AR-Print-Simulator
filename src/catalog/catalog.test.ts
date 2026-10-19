import { describe, expect, it } from 'vitest';
import { parseCatalog, safeImageUrl, type ParseOptions } from './schema';
import { buildDemoCatalog } from './demoCatalog';

const OPTS: ParseOptions = {
  source: 'wix',
  allowedImageHosts: ['static.wixstatic.com'],
  allowRelativeUrls: false,
  baseUrl: 'https://visualizer.example.com/',
};

describe('catalog adapter', () => {
  it('accepts well-formed Wix catalog data and resolves category references', () => {
    const { catalog, rejected } = parseCatalog(
      {
        categories: [
          { id: 'c-kitchen', name: 'Kitchens', kind: 'room', order: 1 },
          { id: 'c-stone', name: 'Stone', kind: 'artwork', order: 2 },
          { id: 'c-glass', name: 'Glass', kind: 'material', order: 1 },
        ],
        scenes: [{ id: 's1', title: 'Kitchen', categoryId: 'c-kitchen', imageUrl: 'https://static.wixstatic.com/media/abc~mv2.jpg', order: 1 }],
        artwork: [
          { id: 'a2', title: 'Second', categoryId: 'c-stone', imageUrl: 'https://static.wixstatic.com/media/b.jpg', order: 2 },
          { id: 'a1', title: 'First', categoryId: 'missing', imageUrl: 'https://static.wixstatic.com/media/a.jpg', order: 1 },
        ],
        materials: [{ id: 'm1', name: 'Clear glass', categoryId: 'c-glass', params: { opacity: 0.4, texture: 'frosted', gloss: 7 } }],
      },
      OPTS,
    );
    expect(rejected).toEqual([]);
    expect(catalog.scenes[0].categoryId).toBe('c-kitchen');
    expect(catalog.artwork.map((a) => a.id)).toEqual(['a1', 'a2']); // sorted by display order
    expect(catalog.artwork[0].categoryId).toBeNull(); // unknown category is not trusted
    expect(catalog.materials[0].params.opacity).toBe(0.4);
    expect(catalog.materials[0].params.texture).toBe('frosted');
    expect(catalog.materials[0].params.gloss).toBe(1); // clamped
  });

  it('drops unsafe or malformed records and reports why', () => {
    const { catalog, rejected } = parseCatalog(
      {
        scenes: [
          { id: 'x1', title: 'Http', imageUrl: 'http://static.wixstatic.com/media/a.jpg' },
          { id: 'x2', title: 'Other host', imageUrl: 'https://evil.example/a.jpg' },
          { id: 'x3', title: 'Script', imageUrl: 'javascript:alert(1)' },
          { id: 'x4', title: 'Ok', imageUrl: 'https://static.wixstatic.com/media/ok.jpg' },
          { id: 'x4', title: 'Duplicate', imageUrl: 'https://static.wixstatic.com/media/ok.jpg' },
          { title: 'No id', imageUrl: 'https://static.wixstatic.com/media/ok.jpg' },
        ],
        artwork: 'not a list',
        categories: [{ id: 'c', name: 'Bad kind', kind: 'video' }],
      },
      OPTS,
    );
    expect(catalog.scenes.map((s) => s.id)).toEqual(['x4']);
    expect(rejected.length).toBe(7);
  });

  it('treats a non-object payload as an empty catalog with an error', () => {
    const { catalog, rejected } = parseCatalog(null, OPTS);
    expect(catalog.scenes).toEqual([]);
    expect(rejected[0].collection).toBe('catalog');
  });

  it('only allows relative URLs for the bundled demo catalog', () => {
    expect(safeImageUrl('demo/rooms/kitchen.jpg', OPTS)).toBeNull();
    expect(safeImageUrl('demo/rooms/kitchen.jpg', { ...OPTS, allowRelativeUrls: true })).toBe('https://visualizer.example.com/demo/rooms/kitchen.jpg');
    expect(safeImageUrl('https://user:pw@static.wixstatic.com/a.jpg', OPTS)).toBeNull();
  });

  it('builds a valid demo catalog that is labelled as demo content', () => {
    const { catalog, rejected } = buildDemoCatalog('https://visualizer.example.com/');
    expect(rejected).toEqual([]);
    expect(catalog.source).toBe('demo');
    expect(catalog.scenes.length).toBeGreaterThanOrEqual(3);
    expect(catalog.artwork.length).toBeGreaterThanOrEqual(6);
    expect(catalog.materials.length).toBeGreaterThanOrEqual(6);
  });
});
