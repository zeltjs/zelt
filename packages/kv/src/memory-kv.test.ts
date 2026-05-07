import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LifecycleManager } from '@zeltjs/core';

import { MemoryKV } from './memory-kv';

describe('MemoryKV (KVStore ops)', () => {
  let kv: MemoryKV;

  beforeEach(() => {
    kv = new MemoryKV(new LifecycleManager());
  });

  it('namespace returns Err for empty prefix, Ok for non-empty', () => {
    const errResult = kv.namespace('');
    expect(errResult.isErr()).toBe(true);
    expect(errResult._unsafeUnwrapErr().type).toBe('EMPTY_NAMESPACE');

    const okResult = kv.namespace('test:');
    expect(okResult.isOk()).toBe(true);
  });

  it('set + get round-trips a JSON object', async () => {
    const store = kv.namespace('test:')._unsafeUnwrap();
    const setR = await store.set('foo', { a: 1, b: ['x'] });
    expect(setR.isOk()).toBe(true);
    const getR = await store.get('foo');
    expect(getR.isOk()).toBe(true);
    expect(getR._unsafeUnwrap()).toEqual({ a: 1, b: ['x'] });
  });

  it('get returns undefined for missing key', async () => {
    const store = kv.namespace('test:')._unsafeUnwrap();
    const r = await store.get('missing');
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap()).toBeUndefined();
  });

  it('has reflects existence', async () => {
    const store = kv.namespace('test:')._unsafeUnwrap();
    expect((await store.has('foo'))._unsafeUnwrap()).toBe(false);
    await store.set('foo', 1);
    expect((await store.has('foo'))._unsafeUnwrap()).toBe(true);
    await store.del('foo');
    expect((await store.has('foo'))._unsafeUnwrap()).toBe(false);
  });

  it('namespace isolates keys', async () => {
    const a = kv.namespace('a:')._unsafeUnwrap();
    const b = kv.namespace('b:')._unsafeUnwrap();
    await a.set('shared', 1);
    const r = await b.get('shared');
    expect(r._unsafeUnwrap()).toBeUndefined();
  });

  it('chained namespace concatenates prefixes', async () => {
    const cache = kv.namespace('cache:')._unsafeUnwrap();
    const user = cache.namespace('user:')._unsafeUnwrap();
    await user.set('42', { name: 'Alice' });
    // top-level confirmation: same physical key
    const r = await kv.namespace('cache:user:')._unsafeUnwrap().get('42');
    expect(r._unsafeUnwrap()).toEqual({ name: 'Alice' });
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
    const kv = new MemoryKV(new LifecycleManager());
    const store = kv.namespace('test:')._unsafeUnwrap();
    await store.set('foo', 1, { ttlSec: 10 });
    expect((await store.get('foo'))._unsafeUnwrap()).toBe(1);
    vi.advanceTimersByTime(11_000);
    expect((await store.get('foo'))._unsafeUnwrap()).toBeUndefined();
  });

  it('expire(key, ttl) extends TTL on existing key, returns true', async () => {
    const kv = new MemoryKV(new LifecycleManager());
    const store = kv.namespace('test:')._unsafeUnwrap();
    await store.set('foo', 1);
    expect((await store.expire('foo', 5))._unsafeUnwrap()).toBe(true);
    vi.advanceTimersByTime(6_000);
    expect((await store.get('foo'))._unsafeUnwrap()).toBeUndefined();
  });

  it('expire(key, ttl) returns false for missing key', async () => {
    const kv = new MemoryKV(new LifecycleManager());
    const store = kv.namespace('test:')._unsafeUnwrap();
    expect((await store.expire('missing', 5))._unsafeUnwrap()).toBe(false);
  });
});

describe('MemoryKV (Disposable)', () => {
  it('shutdown() resolves without error', async () => {
    const kv = new MemoryKV(new LifecycleManager());
    await expect(kv.shutdown()).resolves.toBeUndefined();
  });

  it('shutdown() stops the GC interval (calling shutdown twice does not throw)', async () => {
    const kv = new MemoryKV(new LifecycleManager());
    await kv.shutdown();
    await expect(kv.shutdown()).resolves.toBeUndefined();
  });
});

describe('MemoryKV (AtomicKVStore ops)', () => {
  it('incr from missing key starts at 1, then increments', async () => {
    const kv = new MemoryKV(new LifecycleManager());
    const store = kv.namespace('test:')._unsafeUnwrap();
    expect((await store.incr('counter'))._unsafeUnwrap()).toBe(1);
    expect((await store.incr('counter'))._unsafeUnwrap()).toBe(2);
    expect((await store.incr('counter', 5))._unsafeUnwrap()).toBe(7);
  });

  it('incr sets TTL only on first call when ttlSec given', async () => {
    vi.useFakeTimers();
    try {
      const kv = new MemoryKV(new LifecycleManager());
      const store = kv.namespace('test:')._unsafeUnwrap();
      await store.incr('c', 1, { ttlSec: 10 });
      vi.advanceTimersByTime(5_000);
      // 2 度目の incr で TTL が延長されない
      await store.incr('c', 1, { ttlSec: 100 });
      vi.advanceTimersByTime(6_000);
      // 元の 10 秒 TTL を過ぎているので消える
      expect((await store.get('c'))._unsafeUnwrap()).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('setnx returns true on first call, false on existing', async () => {
    const kv = new MemoryKV(new LifecycleManager());
    const store = kv.namespace('test:')._unsafeUnwrap();
    expect((await store.setnx('lock', 'token-1'))._unsafeUnwrap()).toBe(true);
    expect((await store.setnx('lock', 'token-2'))._unsafeUnwrap()).toBe(false);
    expect((await store.get('lock'))._unsafeUnwrap()).toBe('token-1');
  });

  it('setnx with ttlSec sets expiry', async () => {
    vi.useFakeTimers();
    try {
      const kv = new MemoryKV(new LifecycleManager());
      const store = kv.namespace('test:')._unsafeUnwrap();
      await store.setnx('lock', 'token', { ttlSec: 5 });
      vi.advanceTimersByTime(6_000);
      expect((await store.get('lock'))._unsafeUnwrap()).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
