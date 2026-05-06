import { describe, expect, it } from 'vitest';

import { KVError } from './errors';
import { deserialize, serialize } from './serialize';

describe('serialize', () => {
  it('round-trips primitives', () => {
    expect(deserialize(serialize(42))).toBe(42);
    expect(deserialize(serialize('hello'))).toBe('hello');
    expect(deserialize(serialize(true))).toBe(true);
    expect(deserialize(serialize(null))).toBe(null);
  });

  it('round-trips objects', () => {
    const value = { a: 1, b: ['x', 'y'], c: { d: true } };
    expect(deserialize(serialize(value))).toEqual(value);
  });

  it('throws KVError when serializing undefined', () => {
    expect(() => serialize(undefined)).toThrow(KVError);
  });

  it('returns undefined when deserializing null input', () => {
    expect(deserialize(null)).toBeUndefined();
  });
});
