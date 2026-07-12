import { beforeEach, describe, expect, it } from 'vitest';

import { loadPositions, savePosition } from './positions.lib';

describe('positions', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('grouped scope (uses the pre-existing key)', () => {
    it('round-trips saved positions', () => {
      savePosition('grouped', 'a.ts#A', { x: 1, y: 2 });
      expect(loadPositions('grouped')).toEqual({ 'a.ts#A': { x: 1, y: 2 } });
    });

    it('falls back to empty object on corrupted storage', () => {
      window.localStorage.setItem(`zelt-studio:positions:v2:${window.location.host}`, '{not json');
      expect(loadPositions('grouped')).toEqual({});
    });

    it('falls back to empty object when stored values are not { x, y } numbers', () => {
      window.localStorage.setItem(
        `zelt-studio:positions:v2:${window.location.host}`,
        JSON.stringify({ a: { x: 'bad', y: 2 } }),
      );
      expect(loadPositions('grouped')).toEqual({});
    });

    it('falls back to empty object when the parsed JSON is not an object', () => {
      window.localStorage.setItem(
        `zelt-studio:positions:v2:${window.location.host}`,
        '"just a string"',
      );
      expect(loadPositions('grouped')).toEqual({});
    });

    it('returns well-shaped data unchanged', () => {
      const positions = { 'a.ts#A': { x: 1, y: 2 }, 'b.ts#B': { x: -3, y: 0 } };
      window.localStorage.setItem(
        `zelt-studio:positions:v2:${window.location.host}`,
        JSON.stringify(positions),
      );
      expect(loadPositions('grouped')).toEqual(positions);
    });
  });

  describe('flat scope (uses a separate key)', () => {
    it('round-trips saved positions under its own key', () => {
      savePosition('flat', 'a.ts#A', { x: 5, y: 6 });
      expect(loadPositions('flat')).toEqual({ 'a.ts#A': { x: 5, y: 6 } });
      expect(
        window.localStorage.getItem(`zelt-studio:positions:v2:flat:${window.location.host}`),
      ).not.toBeNull();
    });
  });

  it('does not let grouped and flat positions interfere with each other', () => {
    savePosition('grouped', 'a.ts#A', { x: 1, y: 2 });
    savePosition('flat', 'a.ts#A', { x: 100, y: 200 });

    expect(loadPositions('grouped')).toEqual({ 'a.ts#A': { x: 1, y: 2 } });
    expect(loadPositions('flat')).toEqual({ 'a.ts#A': { x: 100, y: 200 } });
  });
});
