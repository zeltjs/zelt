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

  it('on() before lifecycle.startup() does not touch the socket (P1a regression)', async () => {
    const pub = new Redis(containerUrl, { lazyConnect: true });
    manualClients.push(pub);
    const redis = { client: pub } as unknown as RedisService;
    const lifecycle = new LifecycleManager();
    const adaptor = new RedisEventBusAdaptor(redis, lifecycle);

    await adaptor.on('order.created', () => {});

    expect(asInternals(adaptor).sub.status).toBe('wait');
  });

  it('lifecycle.startup() succeeds after a pre-startup on(), and delivers a message published after startup (P1a/P2 regression)', async () => {
    const pub = new Redis(containerUrl, { lazyConnect: true });
    manualClients.push(pub);
    const redis = { client: pub } as unknown as RedisService;
    const lifecycle = new LifecycleManager();
    const adaptor = new RedisEventBusAdaptor(redis, lifecycle);

    let resolveReceived!: (data: unknown) => void;
    const received = new Promise((resolve) => {
      resolveReceived = resolve;
    });
    await adaptor.on('order.created', (data) => resolveReceived(data));

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

    let resolveReceived!: (data: unknown) => void;
    const received = new Promise((resolve) => {
      resolveReceived = resolve;
    });
    await adaptor.on('order.created', (data) => resolveReceived(data));
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
    let resolveFirst!: () => void;
    const firstReceived = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    await adaptor.once('order.created', (data) => {
      handler(data);
      resolveFirst();
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

// on()'s subscribe-completion contract (pending until SUBSCRIBE settles,
// rejecting leaves no trace) doesn't depend on real ioredis state machine
// transitions the way the P1a/P1c cases above do - a fake sub client with a
// controllable subscribe() is enough, and avoids a container for every run.
describe('RedisEventBusAdaptor on() subscribe-completion contract (fake sub, no Docker)', () => {
  type SubscribeDeferred = {
    resolve: () => void;
    reject: (reason: unknown) => void;
  };

  type EmitterInternals = {
    subscriptions: Set<string>;
    localEmitter: { all: Map<string, unknown[]> };
  };

  const asEmitterInternals = (adaptor: RedisEventBusAdaptor): EmitterInternals =>
    adaptor as unknown as EmitterInternals;

  // Channel -> deferred, so each test controls exactly when (and whether)
  // the fake SUBSCRIBE for a given event settles, from the test body itself
  // rather than from a static/module-level flag.
  const createFakeRedisEventBusAdaptor = () => {
    const subscribeDeferreds = new Map<string, SubscribeDeferred>();
    const fakeSub = {
      status: 'ready',
      on: () => {},
      subscribe: (channel: string) =>
        new Promise<void>((resolve, reject) => {
          subscribeDeferreds.set(channel, { resolve, reject });
        }),
    };
    const fakePub = { duplicate: () => fakeSub };
    const redis = { client: fakePub } as unknown as RedisService;
    const lifecycle = new LifecycleManager();
    const adaptor = new RedisEventBusAdaptor(redis, lifecycle);
    return { adaptor, subscribeDeferreds };
  };

  it('stays pending until the Redis SUBSCRIBE resolves, then resolves with an unsubscribe function', async () => {
    const { adaptor, subscribeDeferreds } = createFakeRedisEventBusAdaptor();

    let settled = false;
    const onPromise = adaptor
      .on('order.created', () => {})
      .then((unsub) => {
        settled = true;
        return unsub;
      });

    expect(settled).toBe(false);

    subscribeDeferreds.get('order.created')?.resolve();
    const unsub = await onPromise;

    expect(settled).toBe(true);
    expect(typeof unsub).toBe('function');
  });

  it('rejects when the Redis SUBSCRIBE rejects, leaving no handler or subscription registered', async () => {
    const { adaptor, subscribeDeferreds } = createFakeRedisEventBusAdaptor();

    const handler = () => {};
    const onPromise = adaptor.on('order.created', handler);
    const failure = new Error('subscribe failed');
    subscribeDeferreds.get('order.created')?.reject(failure);

    await expect(onPromise).rejects.toThrow('subscribe failed');

    const internals = asEmitterInternals(adaptor);
    expect(internals.subscriptions.has('order.created')).toBe(false);
    expect(internals.localEmitter.all.get('order.created') ?? []).not.toContain(handler);
  });

  it('a second on() for the same channel waits on the first in-flight SUBSCRIBE instead of resolving early', async () => {
    const { adaptor, subscribeDeferreds } = createFakeRedisEventBusAdaptor();

    let firstSettled = false;
    let secondSettled = false;
    const firstPromise = adaptor
      .on('order.created', () => {})
      .then((unsub) => {
        firstSettled = true;
        return unsub;
      });
    const secondPromise = adaptor
      .on('order.created', () => {})
      .then((unsub) => {
        secondSettled = true;
        return unsub;
      });

    // Only the first on() should have sent SUBSCRIBE, and neither call can
    // have settled yet since the fake SUBSCRIBE for this channel hasn't.
    expect(firstSettled).toBe(false);
    expect(secondSettled).toBe(false);
    expect(subscribeDeferreds.size).toBe(1);

    subscribeDeferreds.get('order.created')?.resolve();
    const [firstUnsub, secondUnsub] = await Promise.all([firstPromise, secondPromise]);

    expect(firstSettled).toBe(true);
    expect(secondSettled).toBe(true);
    expect(typeof firstUnsub).toBe('function');
    expect(typeof secondUnsub).toBe('function');
  });

  it('a second on() for the same channel rejects with the same error as the first when SUBSCRIBE rejects, leaving no trace', async () => {
    const { adaptor, subscribeDeferreds } = createFakeRedisEventBusAdaptor();

    const firstHandler = () => {};
    const secondHandler = () => {};
    const firstPromise = adaptor.on('order.created', firstHandler);
    const secondPromise = adaptor.on('order.created', secondHandler);
    const failure = new Error('subscribe failed');

    subscribeDeferreds.get('order.created')?.reject(failure);

    await expect(firstPromise).rejects.toThrow('subscribe failed');
    await expect(secondPromise).rejects.toThrow('subscribe failed');

    const internals = asEmitterInternals(adaptor);
    expect(internals.subscriptions.has('order.created')).toBe(false);
    expect(internals.localEmitter.all.get('order.created') ?? []).not.toContain(firstHandler);
    expect(internals.localEmitter.all.get('order.created') ?? []).not.toContain(secondHandler);
  });

  it('a third on() for an already-established channel resolves immediately without sending SUBSCRIBE again', async () => {
    const { adaptor, subscribeDeferreds } = createFakeRedisEventBusAdaptor();

    const onPromise = adaptor.on('order.created', () => {});
    subscribeDeferreds.get('order.created')?.resolve();
    await onPromise;
    subscribeDeferreds.clear();

    let settled = false;
    const thirdPromise = adaptor
      .on('order.created', () => {})
      .then((unsub) => {
        settled = true;
        return unsub;
      });

    await thirdPromise;

    expect(settled).toBe(true);
    expect(subscribeDeferreds.size).toBe(0);
  });
});
