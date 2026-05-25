import type { Next, RequestContext } from '@zeltjs/core';
import { Injectable, inject, UseMiddleware } from '@zeltjs/core';

import { RateLimitExceededException, RateLimitUnavailableException } from './exceptions';
import { RateLimitService } from './rate-limit.service';
import type { RateLimitOptions } from './types';

@Injectable()
export class RateLimitMiddleware {
  constructor(private readonly limiter = inject(RateLimitService)) {}

  /**
   * @throws {RateLimitExceededException} When rate limit is exceeded (429)
   * @throws {RateLimitUnavailableException} When rate limit service is unavailable (503)
   */
  async use(c: RequestContext, next: Next, opts: RateLimitOptions): Promise<Response | undefined> {
    const key = typeof opts.key === 'string' ? opts.key : opts.key();
    const r = await this.limiter.hit(key, {
      limit: opts.limit,
      windowSec: opts.windowSec,
    });

    if (!r.ok) {
      throw new RateLimitUnavailableException({});
    }

    const result = r.value;
    c.header('X-RateLimit-Limit', String(result.limit));
    c.header('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      throw new RateLimitExceededException({
        limit: result.limit,
        remaining: result.remaining,
        retryAfterSec: result.retryAfterSec,
      });
    }

    await next();
    return undefined;
  }
}

/** @throws {E} */
export const RateLimit = (opts: RateLimitOptions): ReturnType<typeof UseMiddleware> =>
  UseMiddleware([RateLimitMiddleware, opts]);
