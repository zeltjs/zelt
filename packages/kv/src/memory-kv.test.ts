import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryKV } from './memory-kv';

describe('MemoryKV (KVStore ops)', () => {
  let kv: MemoryKV;

  beforeEach(() => {
    kv = new MemoryKV();
  });

  it('namespace returns a store and rejects empty prefix', () => {
    expect(() => kv.namespace('')).toThrow();
    const store = kv.namespace('test:');
    expect(store).toBeDefined();
  });

  it('set + get round-trips a JSON object', async () => {
    const store = kv.namespace('test:');
    await store.set('foo', { a: 1, b: ['x'] });
    expect(await store.get('foo')).toEqual({ a: 1, b: ['x'] });
  });

  it('get returns undefined for missing key', async () => {
    const store = kv.namespace('test:');
    expect(await store.get('missing')).toBeUndefined();
  });

  it('has reflects existence', async () => {
    const store = kv.namespace('test:');
    expect(await store.has('foo')).toBe(false);
    await store.set('foo', 1);
    expect(await store.has('foo')).toBe(true);
    await store.del('foo');
    expect(await store.has('foo')).toBe(false);
  });

  it('namespace isolates keys', async () => {
    const a = kv.namespace('a:');
    const b = kv.namespace('b:');
    await a.set('shared', 1);
    expect(await b.get('shared')).toBeUndefined();
  });

  it('chained namespace concatenates prefixes', async () => {
    const cache = kv.namespace('cache:');
    const user = cache.namespace('user:');
    await user.set('42', { name: 'Alice' });
    // top-level confirmation: same physical key
    expect(await kv.namespace('cache:user:').get('42')).toEqual({ name: 'Alice' });
  });
});

describe('MemoryKV (TTL)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('TTL expires the key', async () => {
    const kv = new MemoryKV();
    const store = kv.namespace('test:');
    await store.set('foo', 1, { ttlSec: 10 });
    expect(await store.get('foo')).toBe(1);
    vi.advanceTimersByTime(11_000);
    expect(await store.get('foo')).toBeUndefined();
  });

  it('expire(key, ttl) extends TTL on existing key, returns true', async () => {
    const kv = new MemoryKV();
    const store = kv.namespace('test:');
    await store.set('foo', 1);
    expect(await store.expire('foo', 5)).toBe(true);
    vi.advanceTimersByTime(6_000);
    expect(await store.get('foo')).toBeUndefined();
  });

  it('expire(key, ttl) returns false for missing key', async () => {
    const kv = new MemoryKV();
    const store = kv.namespace('test:');
    expect(await store.expire('missing', 5)).toBe(false);
  });
});

describe('MemoryKV (AtomicKVStore ops)', () => {
  it('incr from missing key starts at 1, then increments', async () => {
    const kv = new MemoryKV();
    const store = kv.namespace('test:');
    expect(await store.incr('counter')).toBe(1);
    expect(await store.incr('counter')).toBe(2);
    expect(await store.incr('counter', 5)).toBe(7);
  });

  it('incr sets TTL only on first call when ttlSec given', async () => {
    vi.useFakeTimers();
    try {
      const kv = new MemoryKV();
      const store = kv.namespace('test:');
      await store.incr('c', 1, { ttlSec: 10 });
      vi.advanceTimersByTime(5_000);
      // 2 度目の incr で TTL が延長されない
      await store.incr('c', 1, { ttlSec: 100 });
      vi.advanceTimersByTime(6_000);
      // 元の 10 秒 TTL を過ぎているので消える
      expect(await store.get('c')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('setnx returns true on first call, false on existing', async () => {
    const kv = new MemoryKV();
    const store = kv.namespace('test:');
    expect(await store.setnx('lock', 'token-1')).toBe(true);
    expect(await store.setnx('lock', 'token-2')).toBe(false);
    expect(await store.get('lock')).toBe('token-1');
  });

  it('setnx with ttlSec sets expiry', async () => {
    vi.useFakeTimers();
    try {
      const kv = new MemoryKV();
      const store = kv.namespace('test:');
      await store.setnx('lock', 'token', { ttlSec: 5 });
      vi.advanceTimersByTime(6_000);
      expect(await store.get('lock')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('delIf deletes when value matches', async () => {
    const kv = new MemoryKV();
    const store = kv.namespace('test:');
    await store.set('lock', 'token-A');
    expect(await store.delIf('lock', 'token-A')).toBe(true);
    expect(await store.has('lock')).toBe(false);
  });

  it('delIf does not delete when value mismatches', async () => {
    const kv = new MemoryKV();
    const store = kv.namespace('test:');
    await store.set('lock', 'token-A');
    expect(await store.delIf('lock', 'token-B')).toBe(false);
    expect(await store.get('lock')).toBe('token-A');
  });
});
