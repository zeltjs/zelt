import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { MinTtlError } from '@zeltjs/kv';

import { RedisConfig } from './redis.config';
import { RedisKV } from './redis-kv';

describe('RedisKVStore TTL validation', () => {
  let driver: RedisKV;

  beforeAll(() => {
    driver = new RedisKV(new RedisConfig());
  });

  afterAll(async () => {
    await driver.shutdown();
  });

  it('set with ttlSec=0 throws MinTtlError', async () => {
    const store = driver.namespace('validation:');
    await expect(store.set('foo', 1, { ttlSec: 0 })).rejects.toBeInstanceOf(MinTtlError);
  });

  it('set with negative ttlSec throws MinTtlError', async () => {
    const store = driver.namespace('validation:');
    await expect(store.set('foo', 1, { ttlSec: -1 })).rejects.toBeInstanceOf(MinTtlError);
  });

  it('expire with ttlSec=0 throws MinTtlError', async () => {
    const store = driver.namespace('validation:');
    await expect(store.expire('foo', 0)).rejects.toBeInstanceOf(MinTtlError);
  });

  it('incr with negative ttlSec throws MinTtlError', async () => {
    const store = driver.namespace('validation:');
    await expect(store.incr('foo', 1, { ttlSec: -10 })).rejects.toBeInstanceOf(MinTtlError);
  });

  it('setnx with negative ttlSec throws MinTtlError', async () => {
    const store = driver.namespace('validation:');
    await expect(store.setnx('foo', 'x', { ttlSec: -1 })).rejects.toBeInstanceOf(MinTtlError);
  });
});
