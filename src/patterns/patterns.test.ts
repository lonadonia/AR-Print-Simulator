import { describe, expect, it } from 'vitest';
import { COLOURWAYS, PATTERNS, mix, normalizePalette, parsePatternKey, patternKey, seededRandom, shade } from './patterns';

describe('pattern maker', () => {
  it('offers a broad, well-formed pattern and colourway library', () => {
    expect(PATTERNS.length).toBeGreaterThanOrEqual(18);
    expect(new Set(PATTERNS.map((p) => p.id)).size).toBe(PATTERNS.length);
    for (const p of PATTERNS) expect(p.aspect).toBeGreaterThan(0);
    expect(COLOURWAYS.length).toBeGreaterThanOrEqual(10);
    for (const cw of COLOURWAYS) for (const c of cw.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('round-trips pattern keys and rejects malformed ones', () => {
    const colors = normalizePalette(['#F4EFE6', '#c9a227', '#8a6f2e', '#ffffff']);
    const key = patternKey('star8', colors);
    expect(key).toBe('pattern:star8:f4efe6-c9a227-8a6f2e-ffffff');
    expect(parsePatternKey(key)).toEqual({ id: 'star8', colors });
    expect(parsePatternKey('pattern:unknown:f4efe6-c9a227-8a6f2e-ffffff')).toBeNull();
    expect(parsePatternKey('pattern:star8:zz')).toBeNull();
  });

  it('normalizes invalid colours to a safe palette', () => {
    expect(normalizePalette(['red', '#123456'])).toEqual([COLOURWAYS[0].colors[0], '#123456', COLOURWAYS[0].colors[2], COLOURWAYS[0].colors[3]]);
  });

  it('mixes colours and keeps random sequences deterministic', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('rgb(128,128,128)');
    expect(shade('#808080', -1)).toBe('rgb(0,0,0)');
    const a = seededRandom(5);
    const b = seededRandom(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
