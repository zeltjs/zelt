import { LifecycleManager } from '@zeltjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryKVAdaptor } from './adaptor-memory';

describe('MemoryKVAdaptor (KVStore ops)', () => {
  let kv: MemoryKVAdaptor;

  beforeEach(() => {
    kv = new MemoryKVAdaptor(new LifecycleManager());
  });

  it('set + get round-trips a JSON object', async () => {
    const store = kv.namespace('test:');
    await store.set('foo', { a: 1, b: ['x'] });
    const result = await store.get('foo');
    expect(result).toEqual({ a: 1, b: ['x'] });
  });

  it('get returns undefined for missing key', async () => {
    const store = kv.namespace('test:');
    const result = await store.get('missing');
    expect(result).toBeUndefined();
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
    const result = await b.get('shared');
    expect(result).toBeUndefined();
  });

  it('chained namespace concatenates prefixes', async () => {
    const cache = kv.namespace('cache:');
    const user = cache.namespace('user:');
    await user.set('42', { name: 'Alice' });
    const result = await kv.namespace('cache:user:').get('42');
    expect(result).toEqual({ name: 'Alice' });
  });
});

describe('MemoryKVAdaptor (TTL)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('TTL expires the key', async () => {
    const kv = new MemoryKVAdaptor(new LifecycleManager());
    const store = kv.namespace('test:');
    await store.set('foo', 1, { ttlSec: 10 });
    expect(await store.get('foo')).toBe(1);
    vi.advanceTimersByTime(11_000);
    expect(await store.get('foo')).toBeUndefined();
  });

  it('expire(key, ttl) extends TTL on existing key, returns true', async () => {
    const kv = new MemoryKVAdaptor(new LifecycleManager());
    const store = kv.namespace('test:');
    await store.set('foo', 1);
    expect(await store.expire('foo', 5)).toBe(true);
    vi.advanceTimersByTime(6_000);
    expect(await store.get('foo')).toBeUndefined();
  });

  it('expire(key, ttl) returns false for missing key', async () => {
    const kv = new MemoryKVAdaptor(new LifecycleManager());
    const store = kv.namespace('test:');
    expect(await store.expire('missing', 5)).toBe(false);
  });
});

describe('MemoryKVAdaptor (Disposable)', () => {
  it('shutdown() resolves without error', async () => {
    const kv = new MemoryKVAdaptor(new LifecycleManager());
    await expect(kv.shutdown()).resolves.toBeUndefined();
  });

  it('shutdown() stops the GC interval (calling shutdown twice does not throw)', async () => {
    const kv = new MemoryKVAdaptor(new LifecycleManager());
    await kv.shutdown();
    await expect(kv.shutdown()).resolves.toBeUndefined();
  });
});

describe('MemoryKVAdaptor (AtomicKVStore ops)', () => {
  it('incr from missing key starts at 1, then increments', async () => {
    const kv = new MemoryKVAdaptor(new LifecycleManager());
    const store = kv.namespace('test:');
    expect(await store.incr('counter')).toBe(1);
    expect(await store.incr('counter')).toBe(2);
    expect(await store.incr('counter', 5)).toBe(7);
  });

  it('incr sets TTL only on first call when ttlSec given', async () => {
    vi.useFakeTimers();
    try {
      const kv = new MemoryKVAdaptor(new LifecycleManager());
      const store = kv.namespace('test:');
      await store.incr('c', 1, { ttlSec: 10 });
      vi.advanceTimersByTime(5_000);
      await store.incr('c', 1, { ttlSec: 100 });
      vi.advanceTimersByTime(6_000);
      expect(await store.get('c')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('setnx returns true on first call, false on existing', async () => {
    const kv = new MemoryKVAdaptor(new LifecycleManager());
    const store = kv.namespace('test:');
    expect(await store.setnx('lock', 'token-1')).toBe(true);
    expect(await store.setnx('lock', 'token-2')).toBe(false);
    expect(await store.get('lock')).toBe('token-1');
  });

  it('setnx with ttlSec sets expiry', async () => {
    vi.useFakeTimers();
    try {
      const kv = new MemoryKVAdaptor(new LifecycleManager());
      const store = kv.namespace('test:');
      await store.setnx('lock', 'token', { ttlSec: 5 });
      vi.advanceTimersByTime(6_000);
      expect(await store.get('lock')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
