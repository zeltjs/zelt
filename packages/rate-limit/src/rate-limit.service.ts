import { Injectable, inject, Logger } from '@zeltjs/core';

import type { RateLimitError } from './errors';
import { kvFailed } from './errors';
import { RateLimitConfig } from './rate-limit.config';
import type { RateLimitResult } from './types';

export type RateLimiterHitResult =
  | { ok: true; value: RateLimitResult }
  | { ok: false; error: RateLimitError };

@Injectable()
export class RateLimitService {
  constructor(
    private config = inject(RateLimitConfig),
    private logger = inject(Logger),
  ) {}

  async hit(
    key: string,
    opts?: { limit?: number; windowSec?: number },
  ): Promise<RateLimiterHitResult> {
    const limit = opts?.limit ?? this.config.defaultLimit;
    const windowSec = opts?.windowSec ?? this.config.defaultWindowSec;

    try {
      const count = await this.config.store.incr(key, 1, { ttlSec: windowSec });
      return { ok: true, value: this.buildResult(count, limit, windowSec) };
    } catch (err) {
      return this.handleKVError(err, key, limit);
    }
  }

  async reset(key: string): Promise<RateLimiterHitResult> {
    try {
      await this.config.store.del(key);
      return { ok: true, value: this.openResult(this.config.defaultLimit) };
    } catch (err) {
      return { ok: false, error: kvFailed(err) };
    }
  }

  private handleKVError(err: unknown, key: string, limit: number): RateLimiterHitResult {
    if (this.config.failureMode === 'closed') {
      return { ok: false, error: kvFailed(err) };
    }
    this.logger.warn(`rate-limit: KV failure key=${key} error=${String(err)}`);
    return { ok: true, value: this.openResult(limit) };
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
    return { allowed: true, remaining: limit, limit, retryAfterSec: 0 };
  }
}
