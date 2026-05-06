import { inject, Injectable, injectConfig, Logger } from '@zeltjs/core';
import { errAsync, okAsync, type ResultAsync } from 'neverthrow';

import { kvFailed, type RateLimitError } from './errors';
import { RateLimitConfig } from './rate-limit.config';
import type { RateLimitResult } from './types';

@Injectable()
export class RateLimiter {
  constructor(
    private config = injectConfig(RateLimitConfig),
    private logger = inject(Logger),
  ) {}

  hit(
    key: string,
    opts?: { limit?: number; windowSec?: number },
  ): ResultAsync<RateLimitResult, RateLimitError> {
    const limit = opts?.limit ?? this.config.defaultLimit;
    const windowSec = opts?.windowSec ?? this.config.defaultWindowSec;

    return this.config.store
      .incr(key, 1, { ttlSec: windowSec })
      .map((count) => this.buildResult(count, limit, windowSec))
      .orElse((kvErr) => {
        if (this.config.failureMode === 'closed') {
          return errAsync(kvFailed(kvErr));
        }
        this.logger.warn(`rate-limit: KV failure key=${key} error=${JSON.stringify(kvErr)}`);
        return okAsync(this.openResult(limit));
      });
  }

  reset(key: string): ResultAsync<void, RateLimitError> {
    return this.config.store.del(key).mapErr(kvFailed);
  }

  private buildResult(count: number, limit: number, windowSec: number): RateLimitResult {
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      limit,
      retryAfterSec: count > limit ? windowSec : 0,
    };
  }

  private openResult(limit: number): RateLimitResult {
    return {
      allowed: true,
      remaining: limit,
      limit,
      retryAfterSec: 0,
    };
  }
}
