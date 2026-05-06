import type { KVError } from '@zeltjs/kv';

import type { RateLimitResult } from './types';

export const tooManyRequestsResponse = (result: RateLimitResult): Response =>
  Response.json(
    { code: 'RATE_LIMIT_EXCEEDED', retryAfterSec: result.retryAfterSec },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
        'Retry-After': String(result.retryAfterSec),
      },
    },
  );

export type RateLimitError = { type: 'KV_FAILED'; cause: KVError; message: string };

export const kvFailed = (cause: KVError): RateLimitError => ({
  type: 'KV_FAILED',
  cause,
  message: `rate-limit KV operation failed: ${cause.message}`,
});
