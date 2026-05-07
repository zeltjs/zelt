import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { LifecycleManager } from '@zeltjs/core';

import { RedisConfig } from './redis.config';
import { RedisKV } from './redis-kv';

describe('RedisKVStore TTL validation', () => {
  let driver: RedisKV;

  beforeAll(() => {
    driver = new RedisKV(new RedisConfig(), new LifecycleManager());
  });

  afterAll(async () => {
    await driver.shutdown();
  });

  it('set with ttlSec=0 returns Err INVALID_TTL', async () => {
    const store = driver.namespace('validation:')._unsafeUnwrap();
    const r = await store.set('foo', 1, { ttlSec: 0 });
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().type).toBe('INVALID_TTL');
  });

  it('set with negative ttlSec returns Err INVALID_TTL', async () => {
    const store = driver.namespace('validation:')._unsafeUnwrap();
    const r = await store.set('foo', 1, { ttlSec: -1 });
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().type).toBe('INVALID_TTL');
  });

  it('expire with ttlSec=0 returns Err INVALID_TTL', async () => {
    const store = driver.namespace('validation:')._unsafeUnwrap();
    const r = await store.expire('foo', 0);
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().type).toBe('INVALID_TTL');
  });

  it('incr with negative ttlSec returns Err INVALID_TTL', async () => {
    const store = driver.namespace('validation:')._unsafeUnwrap();
    const r = await store.incr('foo', 1, { ttlSec: -10 });
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().type).toBe('INVALID_TTL');
  });

  it('setnx with negative ttlSec returns Err INVALID_TTL', async () => {
    const store = driver.namespace('validation:')._unsafeUnwrap();
    const r = await store.setnx('foo', 'x', { ttlSec: -1 });
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().type).toBe('INVALID_TTL');
  });
});
