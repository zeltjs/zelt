import { HTTPException } from '@zeltjs/core';
import { describe, expect, it } from 'vitest';

import { RateLimitExceededException, RateLimitUnavailableException } from './exceptions';

describe('RateLimitExceededException', () => {
  it('is instanceof HTTPException', () => {
    const err = new RateLimitExceededException({
      limit: 100,
      remaining: 0,
      retryAfterSec: 60,
    });
    expect(err instanceof HTTPException).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('has correct status', () => {
    const err = new RateLimitExceededException({
      limit: 100,
      remaining: 0,
      retryAfterSec: 60,
    });
    expect(err.status).toBe(429);
  });

  it('getResponse returns correct response', async () => {
    const err = new RateLimitExceededException({
      limit: 100,
      remaining: 0,
      retryAfterSec: 60,
    });
    const res = err.getResponse();
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
  });
});

describe('RateLimitUnavailableException', () => {
  it('is instanceof HTTPException', () => {
    const err = new RateLimitUnavailableException({});
    expect(err instanceof HTTPException).toBe(true);
  });

  it('has correct status', () => {
    const err = new RateLimitUnavailableException({});
    expect(err.status).toBe(503);
  });
});
