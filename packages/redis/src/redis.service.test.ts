import { LifecycleManager } from '@zeltjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RedisConfig } from './redis.config';

const { RedisMock, connect, disconnect } = vi.hoisted(() => {
  const connect = vi.fn().mockResolvedValue(undefined);
  const disconnect = vi.fn();
  const RedisMock = vi.fn().mockImplementation(() => ({ connect, disconnect }));
  return { RedisMock, connect, disconnect };
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
    connect.mockClear();
    connect.mockResolvedValue(undefined);
    disconnect.mockClear();
    lifecycle = new LifecycleManager();
    service = new RedisService(fakeConfig, lifecycle);
  });

  it('creates the ioredis client from config with lazyConnect on construction', () => {
    expect(RedisMock).toHaveBeenCalledTimes(1);
    expect(RedisMock).toHaveBeenCalledWith(fakeConfig.url, {
      ...fakeConfig.options,
      lazyConnect: true,
    });
  });

  it('does not connect on construction', () => {
    expect(connect).not.toHaveBeenCalled();
  });

  it('forces lazyConnect: true even if config.options sets lazyConnect: false', () => {
    RedisMock.mockClear();
    const configWithLazyConnectFalse = {
      url: 'redis://localhost:6379',
      options: { lazyConnect: false },
    } as unknown as RedisConfig;

    new RedisService(configWithLazyConnectFalse, new LifecycleManager());

    expect(RedisMock).toHaveBeenCalledWith('redis://localhost:6379', { lazyConnect: true });
  });

  it('exposes client immediately after construction, before startup', () => {
    expect(service.client).toBe(RedisMock.mock.results[0]?.value);
  });

  it('connects the client on startup', async () => {
    await lifecycle.startup();

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('rejects lifecycle.startup() when client.connect() rejects', async () => {
    const connectError = new Error('ECONNREFUSED');
    connect.mockRejectedValueOnce(connectError);

    let caught: unknown;
    try {
      await lifecycle.startup();
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      name: 'ZeltReadyFailedError',
      message: 'Lifecycle startup failed: RedisService',
      cause: connectError,
    });
  });

  it('disconnects the client on shutdown', async () => {
    await lifecycle.startup();
    await lifecycle.shutdown();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
