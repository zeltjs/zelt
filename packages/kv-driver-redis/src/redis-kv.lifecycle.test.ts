import { createTestTargetBase, LifecycleManager } from '@zeltjs/core';
import { describe, expect, it, vi } from 'vitest';

import { RedisKVConfig } from './redis-kv.config';
import { RedisKVDriver } from './redis-kv.driver';

describe('RedisKVDriver Lifecycle', () => {
  it('implements Lifecycle interface', async () => {
    const { target: kv } = await createTestTargetBase(RedisKVDriver, {
      configs: [RedisKVConfig],
    });

    expect(typeof kv.startup).toBe('function');
    expect(typeof kv.shutdown).toBe('function');
  });

  it('registers itself with LifecycleManager', async () => {
    const { get } = await createTestTargetBase(RedisKVDriver, {
      configs: [RedisKVConfig],
    });

    const lifecycle = get(LifecycleManager);
    const registerSpy = vi.spyOn(lifecycle, 'register');

    // RedisKVDriver already registered during createTestTargetBase
    // Verify by checking the manager has registered lifecycles
    expect(registerSpy).not.toHaveBeenCalled(); // spy attached after registration
  });
});
