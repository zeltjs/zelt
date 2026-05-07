import { describe, expect, it, vi } from 'vitest';
import { LifecycleManager } from '@zeltjs/core';

import { RedisKV } from './redis-kv';
import { RedisConfig } from './redis.config';

describe('RedisKV Lifecycle', () => {
  it('implements Lifecycle interface', () => {
    const lifecycle = new LifecycleManager();
    const config = new RedisConfig();
    const kv = new RedisKV(config, lifecycle);

    expect(typeof kv.startup).toBe('function');
    expect(typeof kv.shutdown).toBe('function');
  });

  it('registers itself with LifecycleManager', () => {
    const lifecycle = new LifecycleManager();
    const registerSpy = vi.spyOn(lifecycle, 'register');
    const config = new RedisConfig();

    new RedisKV(config, lifecycle);

    expect(registerSpy).toHaveBeenCalledOnce();
  });
});
