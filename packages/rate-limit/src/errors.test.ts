import { describe, expect, it } from 'vitest';

import { tooManyRequestsResponse } from './errors';

describe('tooManyRequestsResponse', () => {
  it('returns a Response with status 429', () => {
    const res = tooManyRequestsResponse({
      allowed: false,
      remaining: 0,
      limit: 5,
      retryAfterSec: 60,
    });
    expect(res.status).toBe(429);
  });

  it('returns a Response with rate-limit headers and JSON body', async () => {
    const res = tooManyRequestsResponse({
      allowed: false,
      remaining: 0,
      limit: 5,
      retryAfterSec: 60,
    });
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(await res.json()).toEqual({ code: 'RATE_LIMIT_EXCEEDED', retryAfterSec: 60 });
  });
});
