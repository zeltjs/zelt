import { describe, expect, it } from 'vitest';

import { createContextKey, getInternal, runInContext, setInternal } from './context-key';

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
      expect(() => getInternal(KEY)).toThrow(/outside request execution/);
      expect(() => setInternal(KEY, 'value')).toThrow(/outside request execution/);
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
