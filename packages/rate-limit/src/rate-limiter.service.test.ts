import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryKV, type AtomicKVStore } from '@zeltjs/kv';
import type { Logger } from '@zeltjs/core';
import { createTestTargetBase } from '@zeltjs/core';
import { errAsync } from 'neverthrow';

import { RateLimitConfig } from './rate-limit.config';
import { RateLimiter } from './rate-limiter.service';

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

let memoryKv: MemoryKV;

beforeAll(async () => {
  const { target } = await createTestTargetBase(MemoryKV);
  memoryKv = target;
});

const makeDefaultLimiter = () => {
  const config = new RateLimitConfig(memoryKv);
  return new RateLimiter(config, mockLogger);
};

describe('RateLimiter', () => {
  it('hit returns allowed=true within limit', async () => {
    const limiter = makeDefaultLimiter();
    const r = await limiter.hit('test:k1', { limit: 3, windowSec: 60 });
    expect(r.isOk()).toBe(true);
    const result = r._unsafeUnwrap();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(result.limit).toBe(3);
  });

  it('hit returns allowed=false after limit exceeded', async () => {
    const limiter = makeDefaultLimiter();
    await limiter.hit('test:k2', { limit: 2, windowSec: 60 });
    await limiter.hit('test:k2', { limit: 2, windowSec: 60 });
    const r = await limiter.hit('test:k2', { limit: 2, windowSec: 60 });
    expect(r.isOk()).toBe(true);
    const result = r._unsafeUnwrap();
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSec).toBe(60);
  });

  it('uses Config defaults when opts omitted', async () => {
    const limiter = makeDefaultLimiter();
    const r = await limiter.hit('test:k3');
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap().limit).toBe(100);
  });

  it('reset deletes the counter', async () => {
    const limiter = makeDefaultLimiter();
    await limiter.hit('test:k4', { limit: 1, windowSec: 60 });
    const resetR = await limiter.reset('test:k4');
    expect(resetR.isOk()).toBe(true);
    const r = await limiter.hit('test:k4', { limit: 1, windowSec: 60 });
    expect(r._unsafeUnwrap().allowed).toBe(true);
  });

  it('failureMode=open returns allowed when store returns Err', async () => {
    const failingConfig = new RateLimitConfig(memoryKv);
    Object.defineProperty(failingConfig, 'store', {
      value: {
        incr: vi.fn().mockReturnValue(
          errAsync({
            type: 'STORE_OPERATION_FAILED',
            op: 'incr',
            cause: new Error('boom'),
            message: 'boom',
          }),
        ),
        del: vi.fn(),
      } as unknown as AtomicKVStore,
    });
    const limiter = new RateLimiter(failingConfig, mockLogger);
    const r = await limiter.hit('test:k5', { limit: 5, windowSec: 60 });
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap().allowed).toBe(true);
  });

  it('failureMode=closed returns Err when store returns Err', async () => {
    const failingConfig = new RateLimitConfig(memoryKv);
    Object.defineProperty(failingConfig, 'store', {
      value: {
        incr: vi.fn().mockReturnValue(
          errAsync({
            type: 'STORE_OPERATION_FAILED',
            op: 'incr',
            cause: new Error('boom'),
            message: 'boom',
          }),
        ),
        del: vi.fn(),
      } as unknown as AtomicKVStore,
    });
    failingConfig.failureMode = 'closed';
    const limiter = new RateLimiter(failingConfig, mockLogger);
    const r = await limiter.hit('test:k6', { limit: 5, windowSec: 60 });
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr().type).toBe('KV_FAILED');
  });
});
