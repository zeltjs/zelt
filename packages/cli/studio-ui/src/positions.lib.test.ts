import { beforeEach, describe, expect, it } from 'vitest';

import { loadPositions, savePosition } from './positions.lib';

describe('positions', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips saved positions', () => {
    savePosition('a.ts#A', { x: 1, y: 2 });
    expect(loadPositions()).toEqual({ 'a.ts#A': { x: 1, y: 2 } });
  });

  it('falls back to empty object on corrupted storage', () => {
    window.localStorage.setItem(`zelt-studio:positions:${window.location.host}`, '{not json');
    expect(loadPositions()).toEqual({});
  });

  it('falls back to empty object when stored values are not { x, y } numbers', () => {
    window.localStorage.setItem(
      `zelt-studio:positions:${window.location.host}`,
      JSON.stringify({ a: { x: 'bad', y: 2 } }),
    );
    expect(loadPositions()).toEqual({});
  });

  it('falls back to empty object when the parsed JSON is not an object', () => {
    window.localStorage.setItem(`zelt-studio:positions:${window.location.host}`, '"just a string"');
    expect(loadPositions()).toEqual({});
  });

  it('returns well-shaped data unchanged', () => {
    const positions = { 'a.ts#A': { x: 1, y: 2 }, 'b.ts#B': { x: -3, y: 0 } };
    window.localStorage.setItem(
      `zelt-studio:positions:${window.location.host}`,
      JSON.stringify(positions),
    );
    expect(loadPositions()).toEqual(positions);
  });
});
