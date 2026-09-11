import { LifecycleManager } from '@zeltjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import type { RedisConfig } from './redis.config';
import { RedisService } from './redis.service';

// P1b regression: a fake ioredis client can't reproduce the real
// lazyConnect -> connecting -> reconnecting state machine, so this test
// (unlike redis.service.test.ts) runs against real ioredis with no mocks.
// Without RedisService.startup() disconnecting the client on a failed
// connect(), ioredis's default retryStrategy keeps scheduling reconnects
// forever, which is exactly what this test guards against.

const UNREACHABLE_REDIS_URL = 'redis://127.0.0.1:1';

describe('RedisService.startup() connection failure (P1b regression, real ioredis)', () => {
  let service: RedisService | undefined;

  afterEach(() => {
    service?.client.disconnect();
    service = undefined;
  });

  it('rejects lifecycle.startup() and stops the client from scheduling further reconnect attempts', async () => {
    const config = { url: UNREACHABLE_REDIS_URL, options: {} } as unknown as RedisConfig;
    const lifecycle = new LifecycleManager();
    service = new RedisService(config, lifecycle);

    let errorEventCount = 0;
    service.client.on('error', () => {
      errorEventCount++;
    });

    await expect(lifecycle.startup()).rejects.toThrow();

    const countRightAfterFailure = errorEventCount;
    // The default retryStrategy would schedule the next attempt within
    // 50-2000ms; wait past that window to prove no attempt actually fires.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(errorEventCount).toBe(countRightAfterFailure);
    expect((service.client as unknown as { reconnectTimeout: unknown }).reconnectTimeout).toBe(
      null,
    );
  });
});
