import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AtomicKVDriver, AtomicKVStore, KVDriver, KVStore } from '../types';

export type ComplianceOptions = {
  /** Use real wall-clock sleeps instead of fake timers for TTL tests (needed for real backends like Redis). */
  realClock?: boolean;
  /** Milliseconds to sleep when realClock is true. Default: 1500. */
  sleepMs?: number;
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const runKVStoreComplianceTests = (
  factory: () => KVDriver,
  options?: ComplianceOptions,
): void => {
  const realClock = options?.realClock ?? false;
  const sleepMs = options?.sleepMs ?? 1500;

  describe('KVStore compliance', () => {
    let driver: KVDriver;
    let store: KVStore;

    beforeEach(() => {
      driver = factory();
      store = driver.namespace('compliance:');
    });

    it('get returns undefined for missing key', async () => {
      expect(await store.get('missing')).toBeUndefined();
    });

    it('set + get round-trips a JSON object', async () => {
      await store.set('foo', { a: 1, nested: ['x', 'y'] });
      expect(await store.get('foo')).toEqual({ a: 1, nested: ['x', 'y'] });
    });

    it('del removes the key', async () => {
      await store.set('foo', 1);
      await store.del('foo');
      expect(await store.has('foo')).toBe(false);
    });

    it('has reflects existence', async () => {
      expect(await store.has('foo')).toBe(false);
      await store.set('foo', 1);
      expect(await store.has('foo')).toBe(true);
    });

    it('chained namespace concatenates prefixes', async () => {
      const sub = store.namespace('sub:');
      await sub.set('foo', 1);
      // verify the same backing store sees the value under the concatenated prefix
      const directParent = driver.namespace('compliance:sub:');
      expect(await directParent.get('foo')).toBe(1);
    });

    it('empty namespace prefix throws', () => {
      expect(() => store.namespace('')).toThrow();
    });

    it('del on missing key is a no-op (no throw)', async () => {
      await expect(store.del('does-not-exist')).resolves.toBeUndefined();
    });

    it('set with undefined value throws', async () => {
      await expect(store.set('foo', undefined)).rejects.toThrow();
    });
  });

  describe('KVStore TTL compliance', () => {
    if (realClock) {
      it(
        'TTL expires the key',
        async () => {
          const store = factory().namespace('compliance-ttl:');
          await store.set('foo', 1, { ttlSec: 1 });
          await sleep(sleepMs);
          expect(await store.get('foo')).toBeUndefined();
        },
        sleepMs + 2000,
      );

      it('expire returns false on missing key', async () => {
        const store = factory().namespace('compliance-ttl:');
        expect(await store.expire('missing', 5)).toBe(false);
      });

      it(
        'expire(key) extends/sets TTL',
        async () => {
          const store = factory().namespace('compliance-ttl:');
          await store.set('foo', 1);
          expect(await store.expire('foo', 1)).toBe(true);
          await sleep(sleepMs);
          expect(await store.get('foo')).toBeUndefined();
        },
        sleepMs + 2000,
      );
    } else {
      beforeEach(() => {
        vi.useFakeTimers();
      });
      afterEach(() => {
        vi.useRealTimers();
      });

      it('TTL expires the key', async () => {
        const store = factory().namespace('compliance-ttl:');
        await store.set('foo', 1, { ttlSec: 10 });
        vi.advanceTimersByTime(11_000);
        expect(await store.get('foo')).toBeUndefined();
      });

      it('expire returns false on missing key', async () => {
        const store = factory().namespace('compliance-ttl:');
        expect(await store.expire('missing', 5)).toBe(false);
      });

      it('expire(key) extends/sets TTL', async () => {
        const store = factory().namespace('compliance-ttl:');
        await store.set('foo', 1);
        expect(await store.expire('foo', 5)).toBe(true);
        vi.advanceTimersByTime(6_000);
        expect(await store.get('foo')).toBeUndefined();
      });
    }
  });

  describe('KVStore namespace compliance', () => {
    it('namespace isolates keys (cache:foo vs ratelimit:foo)', async () => {
      const a = factory().namespace('a:');
      const b = factory().namespace('b:');
      await a.set('shared', 1);
      expect(await b.get('shared')).toBeUndefined();
    });
  });
};

export const runAtomicKVStoreComplianceTests = (
  factory: () => AtomicKVDriver,
  options?: ComplianceOptions,
): void => {
  runKVStoreComplianceTests(factory, options);

  const realClock = options?.realClock ?? false;
  const sleepMs = options?.sleepMs ?? 1500;

  describe('AtomicKVStore compliance', () => {
    let store: AtomicKVStore;

    beforeEach(() => {
      store = factory().namespace('atomic:');
    });

    it('incr starts at 1 from missing, then increments', async () => {
      expect(await store.incr('counter')).toBe(1);
      expect(await store.incr('counter')).toBe(2);
      expect(await store.incr('counter', 5)).toBe(7);
    });

    it('setnx returns true on new, false on existing', async () => {
      expect(await store.setnx('lock', 'a')).toBe(true);
      expect(await store.setnx('lock', 'b')).toBe(false);
      expect(await store.get('lock')).toBe('a');
    });

    it('delIf deletes only on value match', async () => {
      await store.set('lock', 'A');
      expect(await store.delIf('lock', 'B')).toBe(false);
      expect(await store.get('lock')).toBe('A');
      expect(await store.delIf('lock', 'A')).toBe(true);
      expect(await store.has('lock')).toBe(false);
    });

    it('incr is atomic under concurrent calls', async () => {
      await Promise.all(Array.from({ length: 50 }, () => store.incr('hot')));
      expect(await store.get('hot')).toBe(50);
    });
  });

  describe('AtomicKVStore TTL compliance', () => {
    if (realClock) {
      it(
        'incr with ttlSec sets TTL only on first incr (no extension on subsequent)',
        async () => {
          const store = factory().namespace('atomic-ttl:');
          await store.incr('c', 1, { ttlSec: 1 });
          await sleep(500);
          // second incr with a longer ttlSec must NOT extend the TTL
          await store.incr('c', 1, { ttlSec: 100 });
          await sleep(sleepMs);
          // original 1s TTL has elapsed, key must be gone
          expect(await store.get('c')).toBeUndefined();
        },
        sleepMs + 2000,
      );
    } else {
      beforeEach(() => {
        vi.useFakeTimers();
      });
      afterEach(() => {
        vi.useRealTimers();
      });

      it('incr with ttlSec sets TTL only on first incr (no extension on subsequent)', async () => {
        const store = factory().namespace('atomic-ttl:');
        await store.incr('c', 1, { ttlSec: 10 });
        vi.advanceTimersByTime(5_000);
        // second incr with a longer ttlSec must NOT extend the TTL
        await store.incr('c', 1, { ttlSec: 100 });
        vi.advanceTimersByTime(6_000);
        // original 10s TTL has now elapsed (5+6=11s), key must be gone
        expect(await store.get('c')).toBeUndefined();
      });
    }
  });
};
