import { Injectable, inject } from '@zeltjs/core';
import type { RequestContext, Next } from '@zeltjs/core';

import { tooManyRequestsResponse } from './errors';
import { RateLimitService } from './rate-limit.service';
import type { RateLimitOptions } from './types';

@Injectable()
export class RateLimitMiddleware {
  constructor(private readonly limiter = inject(RateLimitService)) {}

  async use(c: RequestContext, next: Next, opts: RateLimitOptions): Promise<Response | undefined> {
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
