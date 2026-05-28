import type { LoggerService } from '@zeltjs/core';
import type { AtomicKVAdaptor, AtomicKVStore } from '@zeltjs/kv';
import { createTestTarget } from '@zeltjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { RateLimitConfig } from './rate-limit.config';
import { RateLimitService } from './rate-limit.service';

const mockLoggerService = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as LoggerService;

const makeDefaultLimiter = async (): Promise<RateLimitService> => {
  const { target: config } = await createTestTarget(RateLimitConfig);
  return new RateLimitService(config, mockLoggerService);
};

const fakeKv = (store: AtomicKVStore): AtomicKVAdaptor => ({
  namespace: () => store,
});

describe('RateLimitService', () => {
  it('hit returns allowed=true within limit', async () => {
    const limiter = await makeDefaultLimiter();
    const r = await limiter.hit('test:k1', { limit: 3, windowSec: 60 });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.allowed).toBe(true);
    expect(r.value.remaining).toBe(2);
    expect(r.value.limit).toBe(3);
  });

  it('hit returns allowed=false after limit exceeded', async () => {
    const limiter = await makeDefaultLimiter();
    await limiter.hit('test:k2', { limit: 2, windowSec: 60 });
    await limiter.hit('test:k2', { limit: 2, windowSec: 60 });
    const r = await limiter.hit('test:k2', { limit: 2, windowSec: 60 });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.allowed).toBe(false);
    expect(r.value.remaining).toBe(0);
    expect(r.value.retryAfterSec).toBe(60);
  });

  it('uses Config defaults when opts omitted', async () => {
    const limiter = await makeDefaultLimiter();
    const r = await limiter.hit('test:k3');
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.limit).toBe(100);
  });

  it('reset deletes the counter', async () => {
    const limiter = await makeDefaultLimiter();
    await limiter.hit('test:k4', { limit: 1, windowSec: 60 });
    const resetR = await limiter.reset('test:k4');
    expect(resetR.ok).toBe(true);
    const r = await limiter.hit('test:k4', { limit: 1, windowSec: 60 });
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.allowed).toBe(true);
  });

  it('failureMode=open returns allowed when store throws', async () => {
    const failingStore = {
      incr: vi.fn().mockRejectedValue(new Error('redis connection refused')),
      del: vi.fn(),
    } as unknown as AtomicKVStore;
    class FailingOpenConfig extends RateLimitConfig {
      constructor() {
        super(fakeKv(failingStore));
      }
    }
    const { target: config } = await createTestTarget(RateLimitConfig, {
      configs: [FailingOpenConfig],
    });
    const limiter = new RateLimitService(config, mockLoggerService);
    const r = await limiter.hit('test:k5', { limit: 5, windowSec: 60 });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.allowed).toBe(true);
  });

  it('failureMode=closed returns error when store throws', async () => {
    const failingStore = {
      incr: vi.fn().mockRejectedValue(new Error('redis connection refused')),
      del: vi.fn(),
    } as unknown as AtomicKVStore;
    class FailingClosedConfig extends RateLimitConfig {
      constructor() {
        super(fakeKv(failingStore));
      }
      override readonly failureMode = 'closed' as const;
    }
    const { target: config } = await createTestTarget(RateLimitConfig, {
      configs: [FailingClosedConfig],
    });
    const limiter = new RateLimitService(config, mockLoggerService);
    const r = await limiter.hit('test:k6', { limit: 5, windowSec: 60 });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected error');
    expect(r.error.type).toBe('KV_FAILED');
  });
});
