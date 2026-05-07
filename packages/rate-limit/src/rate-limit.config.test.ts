import { beforeAll, describe, expect, it } from 'vitest';
import { MemoryKV } from '@zeltjs/kv';
import { createTestTargetBase } from '@zeltjs/core';

import { RateLimitConfig } from './rate-limit.config';

let memoryKv: MemoryKV;

beforeAll(async () => {
  const { target } = await createTestTargetBase(MemoryKV);
  memoryKv = target;
});

describe('RateLimitConfig', () => {
  it('Token is the class itself', () => {
    expect(RateLimitConfig.Token).toBe(RateLimitConfig);
  });

  it('default limit is 100', () => {
    const config = new RateLimitConfig(memoryKv);
    expect(config.defaultLimit).toBe(100);
  });

  it('default windowSec is 60', () => {
    const config = new RateLimitConfig(memoryKv);
    expect(config.defaultWindowSec).toBe(60);
  });

  it('default failureMode is open', () => {
    const config = new RateLimitConfig(memoryKv);
    expect(config.failureMode).toBe('open');
  });

  it('store is namespaced AtomicKVStore', async () => {
    const config = new RateLimitConfig(memoryKv);
    const setR = await config.store.set('foo', 1);
    expect(setR.isOk()).toBe(true);
    const getR = await config.store.get('foo');
    expect(getR._unsafeUnwrap()).toBe(1);
  });
});
