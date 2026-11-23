import { describe, expect, it } from 'vitest';

import { valueKey } from './row.lib';

const same = (a: unknown, b: unknown): boolean => valueKey(a) === valueKey(b);

describe('the identity of column values', () => {
  it('keeps values of different types apart even when they print the same', () => {
    expect(same(1n, 1n)).toBe(true);
    expect(same(1n, '1n')).toBe(false);
    expect(same(1n, 1)).toBe(false);
    expect(same(1, '1')).toBe(false);
    expect(same(null, undefined)).toBe(false);
    expect(same({ amount: 1n }, { amount: 2n })).toBe(false);
  });

  it('compares dates by time and bytes by content, as a second read returns new objects', () => {
    expect(same(new Date(0), new Date(0))).toBe(true);
    expect(same(new Date(0), new Date(1))).toBe(false);
    expect(same(Buffer.from([1, 2]), Buffer.from([1, 2]))).toBe(true);
    expect(same(Buffer.from([1, 2]), Buffer.from([1, 3]))).toBe(false);
  });

  it('compares JSON values whatever the order of their keys', () => {
    expect(same({ a: 1, b: [{ c: 1n, d: 'x' }] }, { b: [{ d: 'x', c: 1n }], a: 1 })).toBe(true);
    expect(same([1, 2], [2, 1])).toBe(false);
  });

  it('keeps the values of a key made of several columns in their order', () => {
    expect(same(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(same(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(same(['a,b'], ['a', 'b'])).toBe(false);
  });
});
