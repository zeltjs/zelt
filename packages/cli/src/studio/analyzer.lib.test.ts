import { describe, expect, it } from 'vitest';

import { extractDecoratorNames, isAppLike } from './analyzer.lib';

describe('isAppLike', () => {
  it('accepts an object with a features array', () => {
    expect(isAppLike({ features: [] })).toBe(true);
  });

  it.each([null, undefined, 42, {}, { features: 'not-array' }])('rejects %j', (value) => {
    expect(isAppLike(value)).toBe(false);
  });
});

describe('extractDecoratorNames', () => {
  it('collects decorator names from metadata props', () => {
    expect(
      extractDecoratorNames([{ decorator: 'Controller', basePath: '/x' }, { other: 1 }]),
    ).toEqual(['Controller']);
  });

  it('returns empty array for props without decorator field', () => {
    expect(extractDecoratorNames([])).toEqual([]);
  });
});
