import { LifecycleManager } from '@zeltjs/core';
import type { RedisService } from '@zeltjs/redis';
import { describe, expect, it } from 'vitest';

import { KVUtilService } from '../util';

import { RedisKVAdaptor } from './redis-kv.adaptor';

// Regression test for P1: SessionMiddleware / RateLimitService call
// `adaptor.namespace(...)` from their own constructors, before the app's
// LifecycleManager has run startup(). RedisService now exposes `client`
// synchronously from construction (lazyConnect), so namespace() must not
// throw when called ahead of lifecycle.startup().
describe('RedisKVAdaptor namespace() before startup (P1 regression)', () => {
  it('returns a store without throwing when called before lifecycle.startup()', () => {
    const fakeClient = {} as unknown;
    const redis = { client: fakeClient } as unknown as RedisService;
    const util = new KVUtilService();
    const lifecycle = new LifecycleManager();

    const adaptor = new RedisKVAdaptor(redis, util, lifecycle);

    expect(() => adaptor.namespace('sess')).not.toThrow();
  });
});
