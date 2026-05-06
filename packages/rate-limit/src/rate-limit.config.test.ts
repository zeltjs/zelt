import { describe, expect, it } from 'vitest';
import { MemoryKV } from '@zeltjs/kv';

import { RateLimitConfig } from './rate-limit.config';

describe('RateLimitConfig', () => {
  it('Token is the class itself', () => {
    expect(RateLimitConfig.Token).toBe(RateLimitConfig);
  });

  it('default limit is 100', () => {
    const config = new RateLimitConfig(new MemoryKV());
    expect(config.defaultLimit).toBe(100);
  });

  it('default windowSec is 60', () => {
    const config = new RateLimitConfig(new MemoryKV());
    expect(config.defaultWindowSec).toBe(60);
  });

  it('default failureMode is open', () => {
    const config = new RateLimitConfig(new MemoryKV());
    expect(config.failureMode).toBe('open');
  });

  it('store is namespaced AtomicKVStore', async () => {
    const config = new RateLimitConfig(new MemoryKV());
    const setR = await config.store.set('foo', 1);
    expect(setR.isOk()).toBe(true);
    const getR = await config.store.get('foo');
    expect(getR._unsafeUnwrap()).toBe(1);
  });
});
