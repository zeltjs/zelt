import { Injectable, injectConfig } from '@zeltjs/core';
import { errAsync, okAsync, type ResultAsync } from 'neverthrow';

import { kvFailed, type RateLimitError } from './errors';
import { RateLimitConfig } from './rate-limit.config';
import type { RateLimitResult } from './types';

const buildResult = (count: number, limit: number, windowSec: number): RateLimitResult => ({
  allowed: count <= limit,
  remaining: Math.max(0, limit - count),
  limit,
  retryAfterSec: count > limit ? windowSec : 0,
});

const openResult = (limit: number): RateLimitResult => ({
  allowed: true,
  remaining: limit,
  limit,
  retryAfterSec: 0,
});

@Injectable()
export class RateLimiter {
  constructor(private config = injectConfig(RateLimitConfig)) {}

  hit(
    key: string,
    opts?: { limit?: number; windowSec?: number },
  ): ResultAsync<RateLimitResult, RateLimitError> {
    const limit = opts?.limit ?? this.config.defaultLimit;
    const windowSec = opts?.windowSec ?? this.config.defaultWindowSec;

    return this.config.store
      .incr(key, 1, { ttlSec: windowSec })
      .map((count) => buildResult(count, limit, windowSec))
      .orElse((kvErr) => {
        if (this.config.failureMode === 'closed') {
          return errAsync(kvFailed(kvErr));
        }
        // console.warn is the spec-mandated fallback logger for KV failures in open failureMode.
        // no-console is disabled only for this file because Logger is not yet exported from core.
        console.warn('rate-limit: KV failure', { err: kvErr, key });
        return okAsync(openResult(limit));
      });
  }

  reset(key: string): ResultAsync<void, RateLimitError> {
    return this.config.store.del(key).mapErr(kvFailed);
  }
}
