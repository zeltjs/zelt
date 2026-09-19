import { Injectable, inject, LifecycleManager } from '@zeltjs/core';
import type { RedisService } from '@zeltjs/redis';
import { RedisConfig } from '@zeltjs/redis';
import { RedisTestContainerConfig } from '@zeltjs/redis/testing';
import { createTestTarget } from '@zeltjs/testing';
import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { RedisEventBusAdaptor } from './redis-event-bus.adaptor';

// P1a/P1c regressions are about real ioredis state transitions (lazyConnect
// auto-connecting on sendCommand, retryStrategy reconnect scheduling), which
// a fake client can't reproduce - that's exactly how the previous fake-based
// tests missed P1a (on() before startup auto-connecting the lazy sub
// client). This file runs against a real Redis server (via testcontainers,
// same as packages/redis/src/testing/redis-test-container.config.test.ts)
// instead of a fake.

type AdaptorInternals = { sub: Redis };

const asInternals = (adaptor: RedisEventBusAdaptor): AdaptorInternals =>
  adaptor as unknown as AdaptorInternals;

@Injectable()
class EventBusTestService {
  constructor(readonly adaptor = inject(RedisEventBusAdaptor)) {}
}

// Reads the connection URL that RedisTestContainerConfig resolved, so the
// on()-before-startup tests below can drive a real ioredis client with
// explicit control over connect()/startup() ordering (createTestTarget's
// get() always resolves *and* starts a lifecycle in one call, so it can't
// express "on() called before startup()").
@Injectable()
class RedisUrlReader {
  constructor(private readonly config = inject(RedisConfig)) {}

  get url(): string {
    return this.config.url;
  }
}

const waitForStatus = async (client: Redis, status: string, timeoutMs = 2000): Promise<void> => {
  const start = Date.now();
  while (client.status !== status) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for status "${status}", got "${client.status}"`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe('RedisEventBusAdaptor', () => {
  let containerUrl: string;
  let stopContainer: () => Promise<void>;
  const manualClients: Redis[] = [];

  beforeAll(async () => {
    const { target, shutdown } = await createTestTarget(RedisUrlReader, {
      configs: [RedisTestContainerConfig],
    });
    containerUrl = target.url;
    stopContainer = shutdown;
  }, 60_000);

  afterAll(async () => {
    for (const client of manualClients.splice(0)) {
      client.disconnect();
    }
    await stopContainer();
  });

  it('on() before lifecycle.startup() does not touch the socket (P1a regression)', () => {
    const pub = new Redis(containerUrl, { lazyConnect: true });
    manualClients.push(pub);
    const redis = { client: pub } as unknown as RedisService;
    const lifecycle = new LifecycleManager();
    const adaptor = new RedisEventBusAdaptor(redis, lifecycle);

    adaptor.on('order.created', () => {});

    expect(asInternals(adaptor).sub.status).toBe('wait');
  });

  it('lifecycle.startup() succeeds after a pre-startup on(), and delivers a message published after startup (P1a/P2 regression)', async () => {
    const pub = new Redis(containerUrl, { lazyConnect: true });
    manualClients.push(pub);
    const redis = { client: pub } as unknown as RedisService;
    const lifecycle = new LifecycleManager();
    const adaptor = new RedisEventBusAdaptor(redis, lifecycle);

    const received = new Promise((resolve) => {
      adaptor.on('order.created', resolve);
    });

    await expect(lifecycle.startup()).resolves.toBeUndefined();
    await adaptor.emit('order.created', { id: 1 });

    await expect(received).resolves.toEqual({ id: 1 });

    await lifecycle.shutdown();
  });

  it('on() after startup subscribes immediately and delivers messages', async () => {
    const { target, shutdown } = await createTestTarget(EventBusTestService, {
      configs: [RedisTestContainerConfig],
    });
    const { adaptor } = target;

    const received = new Promise((resolve) => {
      adaptor.on('order.created', resolve);
    });
    await adaptor.emit('order.created', { id: 2 });

    await expect(received).resolves.toEqual({ id: 2 });

    await shutdown();
  }, 60_000);

  it('once() delivers exactly one message and then stops', async () => {
    const { target, shutdown } = await createTestTarget(EventBusTestService, {
      configs: [RedisTestContainerConfig],
    });
    const { adaptor } = target;

    const handler = vi.fn();
    const firstReceived = new Promise<void>((resolve) => {
      adaptor.once('order.created', (data) => {
        handler(data);
        resolve();
      });
    });

    await adaptor.emit('order.created', { id: 3 });
    await firstReceived;
    await adaptor.emit('order.created', { id: 4 });
    // Give a potential (incorrect) second delivery time to arrive.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ id: 3 });

    await shutdown();
  }, 60_000);

  it('shutdown() disconnects sub', async () => {
    const { target, shutdown } = await createTestTarget(EventBusTestService, {
      configs: [RedisTestContainerConfig],
    });
    const { adaptor } = target;

    await shutdown();

    await waitForStatus(asInternals(adaptor).sub, 'end');
  }, 60_000);
});

// P1c regression: the adaptor's own sub.connect() failure path. This can't
// be driven through createTestTarget/DI, because RedisService (pub) is
// constructed and started before RedisEventBusAdaptor in the injection
// graph - if RedisService's own connection is unreachable, LifecycleManager
// fails and rolls back before the adaptor's startup() (and its sub) is ever
// touched. Isolating the adaptor's sub-specific catch/disconnect logic
// requires pub to be reachable but the *duplicated* sub connection to fail,
// which only a hand-wired client can express deterministically, so this
// case is not run through the container-backed describe block above.
describe('RedisEventBusAdaptor sub connection failure (P1c regression)', () => {
  const UNREACHABLE_REDIS_URL = 'redis://127.0.0.1:1';

  it('rejects lifecycle.startup() and stops the sub client from reconnecting when Redis is unreachable', async () => {
    const pub = new Redis(UNREACHABLE_REDIS_URL, { lazyConnect: true });
    const redis = { client: pub } as unknown as RedisService;
    const lifecycle = new LifecycleManager();
    const adaptor = new RedisEventBusAdaptor(redis, lifecycle);
    const sub = asInternals(adaptor).sub;

    let errorEventCount = 0;
    sub.on('error', () => {
      errorEventCount++;
    });

    await expect(lifecycle.startup()).rejects.toThrow();

    const countRightAfterFailure = errorEventCount;
    // The default retryStrategy would schedule the next attempt within
    // 50-2000ms; wait past that window to prove no attempt actually fires.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(errorEventCount).toBe(countRightAfterFailure);
    expect((sub as unknown as { reconnectTimeout: unknown }).reconnectTimeout).toBe(null);

    pub.disconnect();
  });
});
