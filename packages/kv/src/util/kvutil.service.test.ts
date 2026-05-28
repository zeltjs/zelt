import { describe, expect, it } from 'vitest';

import { KVUtilService } from './kvutil.service';

describe('KVUtilService', () => {
  describe('joinPrefix', () => {
    it('concatenates strings', () => {
      const util = new KVUtilService();
      expect(util.joinPrefix('a:', 'b:')).toBe('a:b:');
      expect(util.joinPrefix('cache:', 'user:')).toBe('cache:user:');
    });

    it('prefixes a key with a namespace', () => {
      const util = new KVUtilService();
      expect(util.joinPrefix('session:', 'user:123')).toBe('session:user:123');
    });
  });

  describe('serialize/deserialize round-trip', () => {
    it('round-trips primitives', () => {
      const util = new KVUtilService();
      expect(util.deserialize(util.serialize(42))).toBe(42);
      expect(util.deserialize(util.serialize('hello'))).toBe('hello');
      expect(util.deserialize(util.serialize(true))).toBe(true);
      expect(util.deserialize(util.serialize(null))).toBe(null);
    });

    it('round-trips objects', () => {
      const util = new KVUtilService();
      const value = { a: 1, b: ['x', 'y'], c: { d: true } };
      expect(util.deserialize(util.serialize(value))).toEqual(value);
    });
  });

  describe('deserialize', () => {
    it('returns undefined when input is null', () => {
      const util = new KVUtilService();
      expect(util.deserialize(null)).toBeUndefined();
    });
  });
});
