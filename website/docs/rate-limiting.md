---
---

# Rate Limiting

Zelt provides rate limiting via the `@zeltjs/rate-limit` package, using a KV store backend for distributed rate limiting.

## Basic Usage

Use the `@RateLimit` decorator to apply rate limiting to routes:

```typescript
import { Controller, Get, Post } from '@zeltjs/core';
import { RateLimit } from '@zeltjs/rate-limit';

@Controller('/api')
export class ApiController {
  @RateLimit({ limit: 100, windowSec: 60 })
  @Get('/data')
  getData() {
    return { items: [] };
  }
}
```

## Dynamic Keys

Rate limiting keys determine how requests are grouped. Use static strings or functions:

```typescript
import { currentUser, headerParam } from '@zeltjs/core';

// By IP address
@RateLimit({ limit: 100, windowSec: 60, key: 'ip' })

// By user ID
@RateLimit({
  limit: 1000,
  windowSec: 60,
  key: () => `user:${currentUser()?.id ?? 'anonymous'}`,
})

// By API key
@RateLimit({
  limit: 500,
  windowSec: 60,
  key: () => `apikey:${headerParam('X-API-Key')}`,
})
```

## Programmatic Usage

Use `RateLimitService` for custom rate limiting logic:

```typescript
import { Controller, Post, inject, response } from '@zeltjs/core';
import { RateLimitService } from '@zeltjs/rate-limit';

@Controller('/auth')
export class AuthController {
  constructor(private rateLimiter = inject(RateLimitService)) {}

  @Post('/login')
  async login(body = validated(LoginSchema), res = response()) {
    const result = await this.rateLimiter.hit(`login:${body.email}`, {
      limit: 5,
      windowSec: 300,
    });

    if (!result.ok) {
      return res.json({ error: 'Service unavailable' }, 503);
    }
    if (!result.value.allowed) {
      return res.json({ error: 'Too many attempts' }, 429);
    }
    return { token: 'jwt-token' };
  }

  @Post('/reset')
  async resetLimit(email: string) {
    await this.rateLimiter.reset(`login:${email}`);
    return { success: true };
  }
}
```

## Custom Configuration

Extend `RateLimitConfig` to customize behavior:

```typescript
import { Config } from '@zeltjs/core';
import { RateLimitConfig } from '@zeltjs/rate-limit';
import { createRedisKVStore } from '@zeltjs/kv-redis';

@Config
class CustomRateLimitConfig extends RateLimitConfig {
  override readonly store = createRedisKVStore({
    url: process.env.REDIS_URL,
  });
  override readonly defaultLimit = 200;
  override readonly defaultWindowSec = 120;
  override readonly failureMode = 'closed' as const;
}
```

## Response Headers and Errors

Rate limit information is included in response headers: `X-RateLimit-Limit` and `X-RateLimit-Remaining`.

| Status | Code | When |
|--------|------|------|
| 429 | `RATE_LIMIT_EXCEEDED` | Rate limit exceeded |
| 503 | `SERVICE_UNAVAILABLE` | KV store fails in `closed` mode |

## Failure Modes

The `failureMode` option controls behavior when the KV store is unavailable:

| Mode | Behavior |
|------|----------|
| `'open'` (default) | Allow requests to proceed when KV store fails |
| `'closed'` | Reject requests with 503 when KV store fails |

Use `'open'` for non-critical rate limiting where availability is prioritized. Use `'closed'` for strict rate limiting where security is critical.

## RateLimitResult Type

The `hit()` method returns `Promise<RateLimiterHitResult>`:

```typescript
type RateLimiterHitResult =
  | { ok: true; value: RateLimitResult }
  | { ok: false; error: RateLimitError };

type RateLimitResult = {
  allowed: boolean;      // Whether the request is permitted
  remaining: number;     // Requests remaining in current window
  limit: number;         // Maximum requests allowed
  retryAfterSec: number; // Seconds until window resets (0 if allowed)
};
```
