import { Injectable, inject } from '@zeltjs/core';
import { RedisConfig, RedisKV } from '@zeltjs/kv-driver-redis';
import { describe, expect, it } from 'vitest';

import { createTestTarget } from '../test-target';

import { RedisTestContainerConfig } from './redis-test-container-config';

describe('RedisTestContainerConfig', () => {
  it('starts a Redis container and provides connection URL', async () => {
    @Injectable()
    class TestService {
      constructor(
        private config = inject(RedisConfig),
        private redis = inject(RedisKV),
      ) {}

      getUrl(): string {
        return this.config.url;
      }

      async ping(): Promise<boolean> {
        const store = this.redis.namespace('test:');
        await store.set('ping', 'pong');
        const result = await store.get<string>('ping');
        return result === 'pong';
      }
    }

    const { target, shutdown } = await createTestTarget(TestService, {
      configs: [RedisTestContainerConfig],
    });

    expect(target.getUrl()).toMatch(/^redis:\/\/localhost:\d+$/);
    expect(await target.ping()).toBe(true);

    await shutdown();
  }, 60_000);

  it('provides empty options by default', async () => {
    @Injectable()
    class ConfigReader {
      constructor(private config = inject(RedisConfig)) {}

      getOptions() {
        return this.config.options;
      }
    }

    const { target, shutdown } = await createTestTarget(ConfigReader, {
      configs: [RedisTestContainerConfig],
    });

    expect(target.getOptions()).toEqual({});

    await shutdown();
  }, 60_000);
});
