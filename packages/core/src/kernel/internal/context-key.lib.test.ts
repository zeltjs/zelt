import { describe, expect, it } from 'vitest';

import { createContextKey, getInternal, runInContext, setInternal } from './context-key.lib';

describe('context-key', () => {
  describe('createContextKey', () => {
    it('creates a unique key with symbol', () => {
      const key1 = createContextKey<string>('test:key1');
      const key2 = createContextKey<string>('test:key2');
      expect(key1._symbol).not.toBe(key2._symbol);
    });
  });

  describe('runInContext / getInternal / setInternal', () => {
    it('stores and retrieves values by key', () => {
      const KEY = createContextKey<{ name: string }>('test:user');
      runInContext(() => {
        setInternal(KEY, { name: 'alice' });
        expect(getInternal(KEY)).toEqual({ name: 'alice' });
      });
    });

    it('returns undefined for unset key', () => {
      const KEY = createContextKey<string>('test:unset');
      runInContext(() => {
        expect(getInternal(KEY)).toBeUndefined();
      });
    });

    it('throws when called outside runInContext', () => {
      const KEY = createContextKey<string>('test:outside');
      expect(() => getInternal(KEY)).toThrow(/outside entry execution/);
      expect(() => setInternal(KEY, 'value')).toThrow(/outside entry execution/);
    });

    it('isolates concurrent contexts', async () => {
      const KEY = createContextKey<string>('test:concurrent');
      const [a, b] = await Promise.all([
        runInContext(async () => {
          setInternal(KEY, 'A');
          await new Promise((r) => setTimeout(r, 10));
          return getInternal(KEY);
        }),
        runInContext(async () => {
          setInternal(KEY, 'B');
          return getInternal(KEY);
        }),
      ]);
      expect(a).toBe('A');
      expect(b).toBe('B');
    });

    it('inherits parent context in nested runInContext', () => {
      const OUTER = createContextKey<string>('test:outer');
      const INNER = createContextKey<string>('test:inner');
      runInContext(() => {
        setInternal(OUTER, 'from-parent');
        runInContext(() => {
          expect(getInternal(OUTER)).toBe('from-parent');
          setInternal(INNER, 'from-child');
          expect(getInternal(INNER)).toBe('from-child');
        });
        expect(getInternal(OUTER)).toBe('from-parent');
        expect(getInternal(INNER)).toBeUndefined();
      });
    });

    it('does not leak inner setInternal to outer context', () => {
      const KEY = createContextKey<string>('test:leak');
      runInContext(() => {
        setInternal(KEY, 'outer');
        runInContext(() => {
          setInternal(KEY, 'inner');
          expect(getInternal(KEY)).toBe('inner');
        });
        expect(getInternal(KEY)).toBe('outer');
      });
    });

    it('isolates different keys', () => {
      const KEY1 = createContextKey<string>('test:key1');
      const KEY2 = createContextKey<number>('test:key2');
      runInContext(() => {
        setInternal(KEY1, 'string');
        setInternal(KEY2, 42);
        expect(getInternal(KEY1)).toBe('string');
        expect(getInternal(KEY2)).toBe(42);
      });
    });
  });
});
