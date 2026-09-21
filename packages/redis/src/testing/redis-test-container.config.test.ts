import { Config, Injectable, inject } from '@zeltjs/core';
import { createTestTarget } from '@zeltjs/testing';
import { describe, expect, it } from 'vitest';

import { RedisConfig } from '../redis.config';

import type { StartedRedisContainer } from './redis-test-container.config';
import { RedisTestContainerConfig } from './redis-test-container.config';

@Injectable()
class ConfigReader {
  constructor(private config = inject(RedisConfig)) {}

  getUrl(): string {
    return this.config.url;
  }

  getOptions(): RedisConfig['options'] {
    return this.config.options;
  }
}

describe('RedisTestContainerConfig', () => {
  it('builds the connection URL from the started container', async () => {
    const started: StartedRedisContainer = {
      host: 'fake-host',
      port: 12345,
      stop: async () => {},
    };

    @Config
    class FakeRedisTestContainerConfig extends RedisTestContainerConfig {
      protected override async startContainer(): Promise<StartedRedisContainer> {
        return started;
      }
    }

    const { target, shutdown } = await createTestTarget(ConfigReader, {
      configs: [FakeRedisTestContainerConfig],
    });

    expect(target.getUrl()).toBe('redis://fake-host:12345');

    await shutdown();
  });

  it('provides empty options by default', async () => {
    const started: StartedRedisContainer = {
      host: 'fake-host',
      port: 12345,
      stop: async () => {},
    };

    @Config
    class FakeRedisTestContainerConfig extends RedisTestContainerConfig {
      protected override async startContainer(): Promise<StartedRedisContainer> {
        return started;
      }
    }

    const { target, shutdown } = await createTestTarget(ConfigReader, {
      configs: [FakeRedisTestContainerConfig],
    });

    expect(target.getOptions()).toEqual({});

    await shutdown();
  });

  it('stops the container on shutdown', async () => {
    const stopped = { count: 0 };
    const started: StartedRedisContainer = {
      host: 'fake-host',
      port: 12345,
      stop: async () => {
        stopped.count += 1;
      },
    };

    @Config
    class FakeRedisTestContainerConfig extends RedisTestContainerConfig {
      protected override async startContainer(): Promise<StartedRedisContainer> {
        return started;
      }
    }

    const { shutdown } = await createTestTarget(ConfigReader, {
      configs: [FakeRedisTestContainerConfig],
    });

    await shutdown();

    expect(stopped.count).toBe(1);
  });
});
