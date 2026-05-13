import { Injectable, inject } from '@zeltjs/core';
import { RedisConfig, RedisService } from '@zeltjs/redis';
import { describe, expect, it } from 'vitest';

import { createTestTarget } from '../test-target';

import { RedisTestContainerConfig } from './redis-test-container.config';

describe('RedisTestContainerConfig', () => {
  it('starts a Redis container and provides connection URL', async () => {
    @Injectable()
    class TestService {
      constructor(
        private config = inject(RedisConfig),
        private redis = inject(RedisService),
      ) {}

      getUrl(): string {
        return this.config.url;
      }

      async ping(): Promise<string> {
        return await this.redis.client.ping();
      }
    }

    const { target, shutdown } = await createTestTarget(TestService, {
      configs: [RedisTestContainerConfig],
    });

    expect(target.getUrl()).toMatch(/^redis:\/\/localhost:\d+$/);
    expect(await target.ping()).toBe('PONG');

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
