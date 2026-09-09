import { LifecycleManager, ZeltLifecycleStateError } from '@zeltjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RedisConfig } from './redis.config';

const { RedisMock, disconnect } = vi.hoisted(() => {
  const disconnect = vi.fn();
  return { disconnect, RedisMock: vi.fn().mockImplementation(() => ({ disconnect })) };
});

vi.mock('ioredis', () => ({
  default: RedisMock,
}));

import { RedisService } from './redis.service';

const fakeConfig = { url: 'redis://localhost:6379', options: {} } as unknown as RedisConfig;

describe('RedisService', () => {
  let lifecycle: LifecycleManager;
  let service: RedisService;

  beforeEach(() => {
    RedisMock.mockClear();
    disconnect.mockClear();
    lifecycle = new LifecycleManager();
    service = new RedisService(fakeConfig, lifecycle);
  });

  it('does not create an ioredis client on construction', () => {
    expect(RedisMock).not.toHaveBeenCalled();
  });

  it('throws when accessing client before startup', () => {
    expect(() => service.client).toThrow(ZeltLifecycleStateError);
  });

  it('creates the ioredis client from config during startup', async () => {
    await lifecycle.startup();

    expect(RedisMock).toHaveBeenCalledTimes(1);
    expect(RedisMock).toHaveBeenCalledWith(fakeConfig.url, fakeConfig.options);
  });

  it('exposes the created client via client after startup', async () => {
    await lifecycle.startup();

    expect(service.client).toBe(RedisMock.mock.results[0]?.value);
  });

  it('disconnects the client on shutdown', async () => {
    await lifecycle.startup();
    await lifecycle.shutdown();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
