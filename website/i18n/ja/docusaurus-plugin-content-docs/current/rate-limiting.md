---
---

# レート制限

Zeltは、KVストアをバックエンドとした分散レート制限として `@zeltjs/rate-limit` パッケージを提供します。

## 基本的な使い方 {#basic-usage}

routeにレート制限を適用するには `@RateLimit` デコレータを使います:

```typescript
import { Controller, Get, Post } from '@zeltjs/core';
import { RateLimit } from '@zeltjs/rate-limit';

@Controller('/api')
export class ApiController {
  @RateLimit({ limit: 100, windowSec: 60, key: 'ip' })
  @Get('/data')
  getData() {
    return { items: [] };
  }
}
```

## 動的なキー {#dynamic-keys}

レート制限のキーは、リクエストがどのようにグルーピングされるかを決定します。静的な文字列または関数を使ってください:

```typescript
// @noErrors
// 理由: module augmentationにはTwoslash VFSでは利用できない完全なmodule resolutionが必要
import { Controller, Get, currentUser, request } from '@zeltjs/core';
import { RateLimit } from '@zeltjs/rate-limit';

declare module '@zeltjs/core' {
  interface RequestContextSchema {
    user: { id: string };
  }
}
// ---cut---
@Controller('/api')
class ApiController {
  // IPアドレスごと
  @RateLimit({ limit: 100, windowSec: 60, key: 'ip' })
  @Get('/public')
  publicData() { return { data: [] }; }

  // ユーザーIDごと
  @RateLimit({
    limit: 1000,
    windowSec: 60,
    key: () => `user:${currentUser()?.id ?? 'anonymous'}`,
  })
  @Get('/user-data')
  userData() { return { data: [] }; }

  // APIキーごと
  @RateLimit({
    limit: 500,
    windowSec: 60,
    key: () => `apikey:${request().header('X-API-Key')}`,
  })
  @Get('/api-data')
  apiData() { return { data: [] }; }
}
```

## プログラムからの利用 {#programmatic-usage}

カスタムのレート制限ロジックには `RateLimitService` を使います:

```typescript
import { Controller, Post, inject, response } from '@zeltjs/core';
import { request } from '@zeltjs/core';
import { RateLimitService } from '@zeltjs/rate-limit';
import * as v from 'valibot';

const LoginSchema = v.object({ email: v.pipe(v.string(), v.email()), password: v.string() });
// ---cut---
@Controller('/auth')
export class AuthController {
  constructor(private rateLimiter = inject(RateLimitService)) {}

  @Post('/login')
  async login(req = request(LoginSchema), res = response()) {
    const body = await req.body();
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

## カスタム設定 {#custom-configuration}

`RateLimitConfig` を継承して挙動をカスタマイズします。デフォルトのインメモリストアの代わりにRedisをlimiterのバックエンドにするには、`RedisKVAdaptor` を `super()` に渡します:

```typescript
import { Config, inject } from '@zeltjs/core';
import { RateLimitConfig } from '@zeltjs/rate-limit';
import { RedisKVAdaptor } from '@zeltjs/kv/adaptor-redis';
// ---cut---
@Config
class CustomRateLimitConfig extends RateLimitConfig {
  constructor(kv = inject(RedisKVAdaptor)) {
    super(kv);
  }

  override readonly kvStoreNamespace = 'ratelimit:';
  override readonly defaultLimit = 200;
  override readonly defaultWindowSec = 120;
  override readonly failureMode = 'closed' as const;
}
```

Redisを使うには、adaptorが接続を解決できるよう `RedisConfig`(`@zeltjs/redis` から)を登録する必要があります。

## レスポンスヘッダーとエラー {#response-headers-and-errors}

レート制限の情報は、レスポンスヘッダー `X-RateLimit-Limit` と `X-RateLimit-Remaining` に含まれます。

| Status | Code | いつ発生するか |
|--------|------|------|
| 429 | `RATE_LIMIT_EXCEEDED` | レート制限を超過した |
| 503 | `SERVICE_UNAVAILABLE` | `closed` モードでKVストアが失敗した |

## 失敗モード {#failure-modes}

`failureMode` オプションは、KVストアが利用できないときの挙動を制御します:

| モード | 挙動 |
|------|----------|
| `'open'`(デフォルト) | KVストアが失敗した場合、リクエストを通過させる |
| `'closed'` | KVストアが失敗した場合、503でリクエストを拒否する |

可用性を優先する重要度の低いレート制限には `'open'` を使ってください。セキュリティが重要な厳格なレート制限には `'closed'` を使ってください。

## RateLimitResult型 {#ratelimitresult-type}

`hit()` メソッドは `Promise<RateLimiterHitResult>` を返します:

```typescript
import type { RateLimitResult, RateLimitError, RateLimiterHitResult } from '@zeltjs/rate-limit';
// ---cut---
type HitResult =
  | { ok: true; value: RateLimitResult }
  | { ok: false; error: RateLimitError };

type Result = {
  allowed: boolean;      // リクエストが許可されるかどうか
  remaining: number;     // 現在のwindowで残っているリクエスト数
  limit: number;         // 許可される最大リクエスト数
  retryAfterSec: number; // windowがリセットされるまでの秒数(許可されている場合は0)
};
```
