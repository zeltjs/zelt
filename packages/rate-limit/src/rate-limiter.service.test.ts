import type { LoggerService } from '@zeltjs/core';
import { createTestTargetBase } from '@zeltjs/core/internal-bridge/testing';
import type { AtomicKVStore } from '@zeltjs/kv';
import { MemoryKVService } from '@zeltjs/kv';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { RateLimitConfig } from './rate-limit.config';
import { RateLimitService } from './rate-limit.service';

const mockLoggerService = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as LoggerService;

let memoryKv: MemoryKVService;

beforeAll(async () => {
  const { target } = await createTestTargetBase(MemoryKVService);
  memoryKv = target;
});

const makeDefaultLimiter = () => {
  const config = new RateLimitConfig(memoryKv);
  return new RateLimitService(config, mockLoggerService);
};

describe('RateLimitService', () => {
  it('hit returns allowed=true within limit', async () => {
    const limiter = makeDefaultLimiter();
    const r = await limiter.hit('test:k1', { limit: 3, windowSec: 60 });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.allowed).toBe(true);
    expect(r.value.remaining).toBe(2);
    expect(r.value.limit).toBe(3);
  });

  it('hit returns allowed=false after limit exceeded', async () => {
    const limiter = makeDefaultLimiter();
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
    const limiter = makeDefaultLimiter();
    const r = await limiter.hit('test:k3');
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.limit).toBe(100);
  });

  it('reset deletes the counter', async () => {
    const limiter = makeDefaultLimiter();
    await limiter.hit('test:k4', { limit: 1, windowSec: 60 });
    const resetR = await limiter.reset('test:k4');
    expect(resetR.ok).toBe(true);
    const r = await limiter.hit('test:k4', { limit: 1, windowSec: 60 });
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.allowed).toBe(true);
  });

  it('failureMode=open returns allowed when store throws', async () => {
    const failingConfig = new RateLimitConfig(memoryKv);
    Object.defineProperty(failingConfig, 'store', {
      value: {
        incr: vi.fn().mockRejectedValue(new Error('redis connection refused')),
        del: vi.fn(),
      } as unknown as AtomicKVStore,
    });
    const limiter = new RateLimitService(failingConfig, mockLoggerService);
    const r = await limiter.hit('test:k5', { limit: 5, windowSec: 60 });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.allowed).toBe(true);
  });

  it('failureMode=closed returns error when store throws', async () => {
    const failingConfig = new RateLimitConfig(memoryKv);
    Object.defineProperty(failingConfig, 'store', {
      value: {
        incr: vi.fn().mockRejectedValue(new Error('redis connection refused')),
        del: vi.fn(),
      } as unknown as AtomicKVStore,
    });
    failingConfig.failureMode = 'closed';
    const limiter = new RateLimitService(failingConfig, mockLoggerService);
    const r = await limiter.hit('test:k6', { limit: 5, windowSec: 60 });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected error');
    expect(r.error.type).toBe('KV_FAILED');
  });
});
