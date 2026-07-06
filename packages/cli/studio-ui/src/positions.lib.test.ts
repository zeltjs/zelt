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
});
