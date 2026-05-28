import { defineHttpException } from '@zeltjs/core';

export const RateLimitExceededException = defineHttpException(
  'RateLimitExceededException',
  429,
  (ctx: { limit: number; remaining: number; retryAfterSec: number }) =>
    `Rate limit exceeded. Retry after ${ctx.retryAfterSec}s`,
  {
    buildResponse: (ctx, status, message) =>
      Response.json(
        { code: 'RATE_LIMIT_EXCEEDED', message, retryAfterSec: ctx.retryAfterSec },
        {
          status,
          headers: {
            'X-RateLimit-Limit': String(ctx.limit),
            'X-RateLimit-Remaining': '0',
            'Retry-After': String(ctx.retryAfterSec),
          },
        },
      ),
  },
);

export const RateLimitUnavailableException = defineHttpException(
  'RateLimitUnavailableException',
  503,
  () => 'Rate limit service unavailable',
  {
    buildResponse: (_ctx, status, message) =>
      Response.json({ code: 'RATE_LIMIT_UNAVAILABLE', message }, { status }),
  },
);
