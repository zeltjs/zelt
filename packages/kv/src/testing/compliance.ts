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
      store = driver.namespace('compliance:')._unsafeUnwrap();
    });

    it('get returns undefined for missing key', async () => {
      const r = await store.get('missing');
      expect(r.isOk(), `expected Ok, got Err: ${JSON.stringify(r.isErr() && r.error)}`).toBe(true);
      expect(r._unsafeUnwrap()).toBeUndefined();
    });

    it('set + get round-trips a JSON object', async () => {
      const setR = await store.set('foo', { a: 1, nested: ['x', 'y'] });
      expect(setR.isOk()).toBe(true);
      const getR = await store.get('foo');
      expect(getR.isOk()).toBe(true);
      expect(getR._unsafeUnwrap()).toEqual({ a: 1, nested: ['x', 'y'] });
    });

    it('del removes the key', async () => {
      await store.set('foo', 1);
      await store.del('foo');
      const r = await store.has('foo');
      expect(r._unsafeUnwrap()).toBe(false);
    });

    it('has reflects existence', async () => {
      const r1 = await store.has('foo');
      expect(r1._unsafeUnwrap()).toBe(false);
      await store.set('foo', 1);
      const r2 = await store.has('foo');
      expect(r2._unsafeUnwrap()).toBe(true);
    });

    it('chained namespace concatenates prefixes', async () => {
      const subResult = store.namespace('sub:');
      expect(subResult.isOk()).toBe(true);
      const sub = subResult._unsafeUnwrap();
      await sub.set('foo', 1);
      // verify the same backing store sees the value under the concatenated prefix
      const directParent = driver.namespace('compliance:sub:')._unsafeUnwrap();
      const r = await directParent.get('foo');
      expect(r._unsafeUnwrap()).toBe(1);
    });

    it('empty namespace prefix returns Err', () => {
      const r = store.namespace('');
      expect(r.isErr()).toBe(true);
      expect(r._unsafeUnwrapErr().type).toBe('EMPTY_NAMESPACE');
    });

    it('del on missing key is a no-op (returns Ok)', async () => {
      const r = await store.del('does-not-exist');
      expect(r.isOk()).toBe(true);
    });

    it('set with undefined value returns Err', async () => {
      const r = await store.set('foo', undefined);
      expect(r.isErr()).toBe(true);
      expect(r._unsafeUnwrapErr().type).toBe('INVALID_VALUE');
    });

    it('set with ttlSec=0 returns Err INVALID_TTL', async () => {
      const r = await store.set('foo', 1, { ttlSec: 0 });
      expect(r.isErr()).toBe(true);
      expect(r._unsafeUnwrapErr().type).toBe('INVALID_TTL');
    });

    it('set with negative ttlSec returns Err INVALID_TTL', async () => {
      const r = await store.set('foo', 1, { ttlSec: -1 });
      expect(r.isErr()).toBe(true);
      expect(r._unsafeUnwrapErr().type).toBe('INVALID_TTL');
    });

    it('expire with ttlSec=0 returns Err INVALID_TTL', async () => {
      await store.set('foo', 1);
      const r = await store.expire('foo', 0);
      expect(r.isErr()).toBe(true);
      expect(r._unsafeUnwrapErr().type).toBe('INVALID_TTL');
    });
  });

  describe('KVStore TTL compliance', () => {
    if (realClock) {
      it(
        'TTL expires the key',
        async () => {
          const store = factory().namespace('compliance-ttl:')._unsafeUnwrap();
          await store.set('foo', 1, { ttlSec: 1 });
          await sleep(sleepMs);
          const r = await store.get('foo');
          expect(r._unsafeUnwrap()).toBeUndefined();
        },
        sleepMs + 2000,
      );

      it('expire returns false on missing key', async () => {
        const store = factory().namespace('compliance-ttl:')._unsafeUnwrap();
        const r = await store.expire('missing', 5);
        expect(r._unsafeUnwrap()).toBe(false);
      });

      it(
        'expire(key) extends/sets TTL',
        async () => {
          const store = factory().namespace('compliance-ttl:')._unsafeUnwrap();
          await store.set('foo', 1);
          const expireR = await store.expire('foo', 1);
          expect(expireR._unsafeUnwrap()).toBe(true);
          await sleep(sleepMs);
          const r = await store.get('foo');
          expect(r._unsafeUnwrap()).toBeUndefined();
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
        const store = factory().namespace('compliance-ttl:')._unsafeUnwrap();
        await store.set('foo', 1, { ttlSec: 10 });
        vi.advanceTimersByTime(11_000);
        const r = await store.get('foo');
        expect(r._unsafeUnwrap()).toBeUndefined();
      });

      it('expire returns false on missing key', async () => {
        const store = factory().namespace('compliance-ttl:')._unsafeUnwrap();
        const r = await store.expire('missing', 5);
        expect(r._unsafeUnwrap()).toBe(false);
      });

      it('expire(key) extends/sets TTL', async () => {
        const store = factory().namespace('compliance-ttl:')._unsafeUnwrap();
        await store.set('foo', 1);
        const expireR = await store.expire('foo', 5);
        expect(expireR._unsafeUnwrap()).toBe(true);
        vi.advanceTimersByTime(6_000);
        const r = await store.get('foo');
        expect(r._unsafeUnwrap()).toBeUndefined();
      });
    }
  });

  describe('KVStore namespace compliance', () => {
    it('namespace isolates keys (cache:foo vs ratelimit:foo)', async () => {
      const a = factory().namespace('a:')._unsafeUnwrap();
      const b = factory().namespace('b:')._unsafeUnwrap();
      await a.set('shared', 1);
      const r = await b.get('shared');
      expect(r._unsafeUnwrap()).toBeUndefined();
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
      store = factory().namespace('atomic:')._unsafeUnwrap();
    });

    it('incr starts at 1 from missing, then increments', async () => {
      expect((await store.incr('counter'))._unsafeUnwrap()).toBe(1);
      expect((await store.incr('counter'))._unsafeUnwrap()).toBe(2);
      expect((await store.incr('counter', 5))._unsafeUnwrap()).toBe(7);
    });

    it('setnx returns true on new, false on existing', async () => {
      expect((await store.setnx('lock', 'a'))._unsafeUnwrap()).toBe(true);
      expect((await store.setnx('lock', 'b'))._unsafeUnwrap()).toBe(false);
      expect((await store.get('lock'))._unsafeUnwrap()).toBe('a');
    });

    it('delIf deletes only on value match', async () => {
      await store.set('lock', 'A');
      expect((await store.delIf('lock', 'B'))._unsafeUnwrap()).toBe(false);
      expect((await store.get('lock'))._unsafeUnwrap()).toBe('A');
      expect((await store.delIf('lock', 'A'))._unsafeUnwrap()).toBe(true);
      expect((await store.has('lock'))._unsafeUnwrap()).toBe(false);
    });

    it('incr is atomic under concurrent calls', async () => {
      await Promise.all(Array.from({ length: 50 }, () => store.incr('hot')));
      const r = await store.get('hot');
      expect(r._unsafeUnwrap()).toBe(50);
    });
  });

  describe('AtomicKVStore TTL compliance', () => {
    if (realClock) {
      it(
        'incr with ttlSec sets TTL only on first incr (no extension on subsequent)',
        async () => {
          const store = factory().namespace('atomic-ttl:')._unsafeUnwrap();
          await store.incr('c', 1, { ttlSec: 1 });
          await sleep(500);
          // second incr with a longer ttlSec must NOT extend the TTL
          await store.incr('c', 1, { ttlSec: 100 });
          await sleep(sleepMs);
          // original 1s TTL has elapsed, key must be gone
          const r = await store.get('c');
          expect(r._unsafeUnwrap()).toBeUndefined();
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
        const store = factory().namespace('atomic-ttl:')._unsafeUnwrap();
        await store.incr('c', 1, { ttlSec: 10 });
        vi.advanceTimersByTime(5_000);
        // second incr with a longer ttlSec must NOT extend the TTL
        await store.incr('c', 1, { ttlSec: 100 });
        vi.advanceTimersByTime(6_000);
        // original 10s TTL has now elapsed (5+6=11s), key must be gone
        const r = await store.get('c');
        expect(r._unsafeUnwrap()).toBeUndefined();
      });
    }
  });
};
