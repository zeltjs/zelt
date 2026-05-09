import { Injectable, inject, UseMiddleware } from '@zeltjs/core';
import type { MiddlewareClass, RequestContext, Next } from '@zeltjs/core';

import { tooManyRequestsResponse } from './errors';
import { RateLimiter } from './rate-limiter.service';
import type { RateLimitOptions } from './types';

const createRateLimitMiddlewareClass = (opts: RateLimitOptions): MiddlewareClass => {
  @Injectable()
  class RateLimitMiddleware {
    private readonly limiter: RateLimiter;

    constructor(limiter = inject(RateLimiter)) {
      this.limiter = limiter;
    }

    async use(c: RequestContext, next: Next): Promise<Response | undefined> {
      const key = typeof opts.key === 'string' ? opts.key : opts.key();
      const r = await this.limiter.hit(key, {
        limit: opts.limit,
        windowSec: opts.windowSec,
      });

      if (!r.ok) {
        return c.json({ code: 'RATE_LIMIT_UNAVAILABLE' }, 503);
      }

      const result = r.value;
      c.header('X-RateLimit-Limit', String(result.limit));
      c.header('X-RateLimit-Remaining', String(result.remaining));

      if (!result.allowed) {
        return tooManyRequestsResponse(result);
      }

      await next();
      return undefined;
    }
  }

  return RateLimitMiddleware;
};

export const RateLimit = (opts: RateLimitOptions) => {
  const middlewareClass = createRateLimitMiddlewareClass(opts);
  return UseMiddleware(middlewareClass);
};
