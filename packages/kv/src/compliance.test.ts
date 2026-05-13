import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KVError } from './errors';
import type { AtomicKVAdaptor, AtomicKVStore, KVAdaptor, KVStore } from './types';

export type ComplianceOptions = {
  /** Use real wall-clock sleeps instead of fake timers for TTL tests (needed for real backends like Redis). */
  realClock?: boolean;
  /** Milliseconds to sleep when realClock is true. Default: 1500. */
  sleepMs?: number;
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const runKVStoreGetSetDelTests = (getStore: () => KVStore): void => {
  it('get returns undefined for missing key', async () => {
    const result = await getStore().get('missing');
    expect(result).toBeUndefined();
  });

  it('set + get round-trips a JSON object', async () => {
    const store = getStore();
    await store.set('foo', { a: 1, nested: ['x', 'y'] });
    const result = await store.get('foo');
    expect(result).toEqual({ a: 1, nested: ['x', 'y'] });
  });

  it('del removes the key', async () => {
    const store = getStore();
    await store.set('foo', 1);
    await store.del('foo');
    const result = await store.has('foo');
    expect(result).toBe(false);
  });

  it('has reflects existence', async () => {
    const store = getStore();
    expect(await store.has('foo')).toBe(false);
    await store.set('foo', 1);
    expect(await store.has('foo')).toBe(true);
  });

  it('del on missing key is a no-op', async () => {
    await expect(getStore().del('does-not-exist')).resolves.toBeUndefined();
  });
};

const runKVStoreNamespaceTests = (getDriver: () => KVAdaptor, getStore: () => KVStore): void => {
  it('chained namespace concatenates prefixes', async () => {
    const store = getStore();
    const sub = store.namespace('sub:');
    await sub.set('foo', 1);
    const directParent = getDriver().namespace('compliance:sub:');
    const result = await directParent.get('foo');
    expect(result).toBe(1);
  });
};

const runKVStoreValidationTests = (getStore: () => KVStore): void => {
  it('set with ttlSec=0 throws INVALID_TTL', async () => {
    await expect(getStore().set('foo', 1, { ttlSec: 0 })).rejects.toThrow(KVError);
  });

  it('set with negative ttlSec throws INVALID_TTL', async () => {
    await expect(getStore().set('foo', 1, { ttlSec: -1 })).rejects.toThrow(KVError);
  });

  it('expire with ttlSec=0 throws INVALID_TTL', async () => {
    const store = getStore();
    await store.set('foo', 1);
    await expect(store.expire('foo', 0)).rejects.toThrow(KVError);
  });
};

const runKVStoreBasicTests = (factory: () => KVAdaptor): void => {
  describe('KVStore compliance', () => {
    let driver: KVAdaptor;
    let store: KVStore;
    const getDriver = (): KVAdaptor => driver;
    const getStore = (): KVStore => store;

    beforeEach(() => {
      driver = factory();
      store = driver.namespace('compliance:');
    });

    runKVStoreGetSetDelTests(getStore);
    runKVStoreNamespaceTests(getDriver, getStore);
    runKVStoreValidationTests(getStore);
  });
};

const runKVStoreTTLTestsRealClock = (factory: () => KVAdaptor, sleepMs: number): void => {
  describe('KVStore TTL compliance', () => {
    it(
      'TTL expires the key',
      async () => {
        const store = factory().namespace('compliance-ttl:');
        await store.set('foo', 1, { ttlSec: 1 });
        await sleep(sleepMs);
        const result = await store.get('foo');
        expect(result).toBeUndefined();
      },
      sleepMs + 2000,
    );

    it('expire returns false on missing key', async () => {
      const store = factory().namespace('compliance-ttl:');
      const result = await store.expire('missing', 5);
      expect(result).toBe(false);
    });

    it(
      'expire(key) extends/sets TTL',
      async () => {
        const store = factory().namespace('compliance-ttl:');
        await store.set('foo', 1);
        const expireResult = await store.expire('foo', 1);
        expect(expireResult).toBe(true);
        await sleep(sleepMs);
        const result = await store.get('foo');
        expect(result).toBeUndefined();
      },
      sleepMs + 2000,
    );
  });
};

const runKVStoreTTLTestsFakeClock = (factory: () => KVAdaptor): void => {
  describe('KVStore TTL compliance', () => {
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
      const result = await store.get('foo');
      expect(result).toBeUndefined();
    });

    it('expire returns false on missing key', async () => {
      const store = factory().namespace('compliance-ttl:');
      const result = await store.expire('missing', 5);
      expect(result).toBe(false);
    });

    it('expire(key) extends/sets TTL', async () => {
      const store = factory().namespace('compliance-ttl:');
      await store.set('foo', 1);
      const expireResult = await store.expire('foo', 5);
      expect(expireResult).toBe(true);
      vi.advanceTimersByTime(6_000);
      const result = await store.get('foo');
      expect(result).toBeUndefined();
    });
  });
};

const runKVStoreNamespaceIsolationTests = (factory: () => KVAdaptor): void => {
  describe('KVStore namespace compliance', () => {
    it('namespace isolates keys (cache:foo vs ratelimit:foo)', async () => {
      const a = factory().namespace('a:');
      const b = factory().namespace('b:');
      await a.set('shared', 1);
      const result = await b.get('shared');
      expect(result).toBeUndefined();
    });
  });
};

export const runKVStoreComplianceTests = (
  factory: () => KVAdaptor,
  options?: ComplianceOptions,
): void => {
  const realClock = options?.realClock ?? false;
  const sleepMs = options?.sleepMs ?? 1500;

  runKVStoreBasicTests(factory);
  if (realClock) {
    runKVStoreTTLTestsRealClock(factory, sleepMs);
  } else {
    runKVStoreTTLTestsFakeClock(factory);
  }
  runKVStoreNamespaceIsolationTests(factory);
};

const runAtomicKVStoreBasicTests = (factory: () => AtomicKVAdaptor): void => {
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

    it('incr is atomic under concurrent calls', async () => {
      await Promise.all(Array.from({ length: 50 }, () => store.incr('hot')));
      const result = await store.get('hot');
      expect(result).toBe(50);
    });
  });
};

const runAtomicKVStoreTTLTestsRealClock = (
  factory: () => AtomicKVAdaptor,
  sleepMs: number,
): void => {
  describe('AtomicKVStore TTL compliance', () => {
    it(
      'incr with ttlSec sets TTL only on first incr (no extension on subsequent)',
      async () => {
        const store = factory().namespace('atomic-ttl:');
        await store.incr('c', 1, { ttlSec: 1 });
        await sleep(500);
        await store.incr('c', 1, { ttlSec: 100 });
        await sleep(sleepMs);
        const result = await store.get('c');
        expect(result).toBeUndefined();
      },
      sleepMs + 2000,
    );
  });
};

const runAtomicKVStoreTTLTestsFakeClock = (factory: () => AtomicKVAdaptor): void => {
  describe('AtomicKVStore TTL compliance', () => {
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
      await store.incr('c', 1, { ttlSec: 100 });
      vi.advanceTimersByTime(6_000);
      const result = await store.get('c');
      expect(result).toBeUndefined();
    });
  });
};

export const runAtomicKVStoreComplianceTests = (
  factory: () => AtomicKVAdaptor,
  options?: ComplianceOptions,
): void => {
  runKVStoreComplianceTests(factory, options);

  const realClock = options?.realClock ?? false;
  const sleepMs = options?.sleepMs ?? 1500;

  runAtomicKVStoreBasicTests(factory);
  if (realClock) {
    runAtomicKVStoreTTLTestsRealClock(factory, sleepMs);
  } else {
    runAtomicKVStoreTTLTestsFakeClock(factory);
  }
};
