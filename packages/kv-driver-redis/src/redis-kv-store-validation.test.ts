import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { LifecycleManager } from '@zeltjs/core';
import { KVError } from '@zeltjs/kv';

import { RedisKVConfig } from './redis-kv.config';
import { RedisKVDriver } from './redis-kv.driver';

describe('RedisKVStore TTL validation', () => {
  let driver: RedisKVDriver;

  beforeAll(() => {
    driver = new RedisKVDriver(new RedisKVConfig(), new LifecycleManager());
  });

  afterAll(async () => {
    await driver.shutdown();
  });

  it('set with ttlSec=0 throws INVALID_TTL', async () => {
    const store = driver.namespace('validation:');
    await expect(store.set('foo', 1, { ttlSec: 0 })).rejects.toThrow(KVError);
  });

  it('set with negative ttlSec throws INVALID_TTL', async () => {
    const store = driver.namespace('validation:');
    await expect(store.set('foo', 1, { ttlSec: -1 })).rejects.toThrow(KVError);
  });

  it('expire with ttlSec=0 throws INVALID_TTL', async () => {
    const store = driver.namespace('validation:');
    await expect(store.expire('foo', 0)).rejects.toThrow(KVError);
  });

  it('incr with negative ttlSec throws INVALID_TTL', async () => {
    const store = driver.namespace('validation:');
    await expect(store.incr('foo', 1, { ttlSec: -10 })).rejects.toThrow(KVError);
  });

  it('setnx with negative ttlSec throws INVALID_TTL', async () => {
    const store = driver.namespace('validation:');
    await expect(store.setnx('foo', 'x', { ttlSec: -1 })).rejects.toThrow(KVError);
  });
});
