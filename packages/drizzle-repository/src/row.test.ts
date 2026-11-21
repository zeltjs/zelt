import { describe, expect, it } from 'vitest';

import { sameValue } from './row.lib';

describe('comparing column values to find changes', () => {
  it('compares objects holding bigint values', () => {
    expect(sameValue({ amount: 1n }, { amount: 1n })).toBe(true);
    expect(sameValue({ amount: 1n }, { amount: 2n })).toBe(false);
  });

  it('compares dates by time', () => {
    expect(sameValue(new Date(0), new Date(0))).toBe(true);
  });
});
