import type { Next, RequestContext } from '@zeltjs/core';
import { Injectable, inject, UseMiddleware } from '@zeltjs/core';

import { RateLimitConfig } from './rate-limit.config';
import { RateLimitExceededException, RateLimitUnavailableException } from './rate-limit.exceptions';
import { RateLimitService } from './rate-limit.service';
import type { RateLimitOptions } from './rate-limit.types';

@Injectable()
export class RateLimitMiddleware {
  constructor(
    private readonly limiter = inject(RateLimitService),
    private readonly config = inject(RateLimitConfig),
  ) {}

  /**
   * @throws {RateLimitExceededException} When rate limit is exceeded (429)
   * @throws {RateLimitUnavailableException} When rate limit service is unavailable (503)
   */
  async use(c: RequestContext, next: Next, opts: RateLimitOptions): Promise<Response | undefined> {
    if (!this.config.enabled) {
      await next();
      return undefined;
    }

    const key = typeof opts.key === 'string' ? opts.key : await opts.key();
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
