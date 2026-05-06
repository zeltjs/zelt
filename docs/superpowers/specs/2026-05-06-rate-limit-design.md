# @zeltjs/rate-limit Design Spec

## Overview

レート制限機能。`@zeltjs/kv` の `AtomicKVStore` 上に Fixed Window アルゴリズムを実装。controller method に `@RateLimit` decorator を貼る宣言的 API と、サービスから直接呼べる low-level API を提供する。
key 関数は entry context 内で評価されるため、既存 primitive (`ip()`, `currentUser()`, `validated()`, `pathParam()`) をそのまま組み合わせられ、preset 群を学ぶ必要がない。

## Goals

- `@RateLimit` decorator による宣言的 rate limit
- 複数 decorator スタッキング（IP + user 二重制限など）
- 静的 key（global throttle）と動的 key（request 単位）両対応
- KV 障害時の fail-open / fail-closed 切替
- 標準 response header（`X-RateLimit-*`, `Retry-After`）の自動付与
- `@zeltjs/core` 既存 primitive との一貫性（`pathParam` / `validated` / `currentUser` と同じ流儀で `ip()` を使える）

## Non-Goals

- Sliding window counter / Token bucket（v2）
- 動的 limit/window（v1 は静的のみ。動的に変えたい場合は service 経由で `RateLimiter.hit()` を直接呼ぶ）
- 複数 algorithm の Config 切替（v2）
- Distributed coordination（KV の atomic ops に委譲）
- preset key strategy 関数（`byIp` / `byUser` 等）— **既存 primitive で書けるため不要**

## Required Additions to `@zeltjs/core`

`ip()` primitive を追加（rate-limit 専用ではなく、ログ・監査・カスタム処理でも使えるため `@zeltjs/core` 側に置く）。

```typescript
// packages/core/src/primitives/ip.ts
import { getEntryContext } from '../internal/entry-context';

export const ip = (): string => {
  const honoCtx = getEntryContext().honoContext;
  return honoCtx.req.header('cf-connecting-ip')          // Cloudflare
      ?? honoCtx.req.header('x-real-ip')                 // nginx
      ?? honoCtx.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      ?? 'unknown';
};
```

`packages/core/src/index.ts` から export を追加。trust proxy のカスタマイズは v2 で `IpConfig` を用意する。

## Package Structure

```
packages/rate-limit/
├── src/
│   ├── index.ts
│   ├── rate-limiter.service.ts   ← @Injectable RateLimiter (low-level API)
│   ├── rate-limit.decorator.ts   ← @RateLimit (decorator → middleware 登録)
│   ├── rate-limit.config.ts      ← @Config RateLimitConfig
│   ├── errors.ts                 ← TooManyRequestsException
│   └── types.ts                  ← RateLimitOptions / RateLimitResult
├── test/
├── package.json
└── tsconfig.json
```

## Dependencies

- `@zeltjs/core` — peerDependency (`@Config`, `@Injectable`, `injectConfig`, `inject`, `HTTPException`, `UseMiddleware`, `ip`, `getEntryContext`)
- `@zeltjs/kv` — peerDependency (`AtomicKVStore`, `MemoryKV`)

## API Design

### Types

```typescript
export type RateLimitOptions = {
  limit: number;
  windowSec: number;
  /** 静的 key、または entry context 内で評価される関数 */
  key: string | (() => string);
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSec: number;
};
```

### RateLimitConfig

```typescript
import { Config, inject } from '@zeltjs/core';
import { MemoryKV, type AtomicKVStore } from '@zeltjs/kv';

@Config
export class RateLimitConfig {
  static readonly Token = RateLimitConfig;

  /** AtomicKVStore を返す。namespace 必須 (型レベルで強制) */
  constructor(kv = inject(MemoryKV)) {
    this.store = kv.namespace('rate-limit:');
  }

  readonly store: AtomicKVStore;
  defaultLimit = 100;
  defaultWindowSec = 60;
  /** KV 障害時の挙動。'open' = 通す、'closed' = 拒否 */
  failureMode: 'open' | 'closed' = 'open';
}
```

User extends で driver 切替・デフォルト値変更:

```typescript
@Config
export class AppRateLimitConfig extends RateLimitConfig {
  constructor(kv = inject(RedisKV)) {  // ← driver 切替
    super(kv as MemoryKV);  // type widening (cast or restructure)
  }
}
```

実用上は extends より同名 Config を上書き定義する形が多い（needle-di の bind 仕様に依存、実装時要確認）。

### RateLimiter Service

```typescript
import { Injectable, inject, injectConfig } from '@zeltjs/core';
import type { Logger } from '@zeltjs/core';

@Injectable()
export class RateLimiter {
  constructor(
    private config = injectConfig(RateLimitConfig),
    private logger = inject(Logger),
  ) {}

  /** counter を 1 増やし、limit との比較結果を返す */
  async hit(key: string, opts?: { limit?: number; windowSec?: number }): Promise<RateLimitResult> {
    const limit = opts?.limit ?? this.config.defaultLimit;
    const windowSec = opts?.windowSec ?? this.config.defaultWindowSec;

    try {
      const count = await this.config.store.incr(key, 1, { ttlSec: windowSec });
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        limit,
        retryAfterSec: count > limit ? windowSec : 0,
      };
    } catch (err) {
      this.logger.warn({ err, key }, 'rate-limit: KV failure');
      if (this.config.failureMode === 'closed') throw err;
      return { allowed: true, remaining: limit, limit, retryAfterSec: 0 };
    }
  }

  /** 手動リセット（成功時に login 制限を解除する等） */
  async reset(key: string): Promise<void> {
    await this.config.store.del(key);
  }
}
```

### @RateLimit Decorator

`@UseMiddleware` と同じ metadata 経由で middleware を登録するパターン。各 `@RateLimit({...})` 呼び出しは独自の middleware function を生成する。

```typescript
import { UseMiddleware, getEntryContext, inject } from '@zeltjs/core';
import type { FunctionMiddleware } from '@zeltjs/core';

export const RateLimit = (opts: RateLimitOptions) => {
  const middleware: FunctionMiddleware = async (c, next) => {
    const limiter = inject(RateLimiter);
    const key = typeof opts.key === 'string' ? opts.key : opts.key();
    const result = await limiter.hit(key, { limit: opts.limit, windowSec: opts.windowSec });

    c.header('X-RateLimit-Limit', String(result.limit));
    c.header('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) throw new TooManyRequestsException(result);
    await next();
  };

  return UseMiddleware(middleware);
};
```

key 関数 (`opts.key()`) は middleware 内で呼ばれ、その時点で `getEntryContext()` が利用可能 → `ip()` `currentUser()` `validated()` 等の primitive がすべて使える。

複数スタッキング時は `@UseMiddleware` の append 動作により上から順に評価される。1 つでも `TooManyRequestsException` を throw すれば後続の rate-limit と handler はスキップされる。

### TooManyRequestsException

```typescript
import { HTTPException } from 'hono/http-exception';
import type { RateLimitResult } from './types';

export class TooManyRequestsException extends HTTPException {
  constructor(public result: RateLimitResult) {
    super(429, {
      message: 'Too Many Requests',
      res: Response.json(
        { code: 'RATE_LIMIT_EXCEEDED', retryAfterSec: result.retryAfterSec },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(result.limit),
            'X-RateLimit-Remaining': '0',
            'Retry-After': String(result.retryAfterSec),
          },
        },
      ),
    });
  }
}
```

`HTTPException` を継承しているため、`@zeltjs/core` の error handling パイプラインに自動で乗る。

## Exports

```typescript
export { RateLimiter } from './rate-limiter.service';
export { RateLimit } from './rate-limit.decorator';
export { RateLimitConfig } from './rate-limit.config';
export { TooManyRequestsException } from './errors';
export type { RateLimitOptions, RateLimitResult } from './types';
```

## package.json

```json
{
  "name": "@zeltjs/rate-limit",
  "version": "0.1.0",
  "type": "module",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/zeltjs/zelt.git",
    "directory": "packages/rate-limit"
  },
  "publishConfig": {
    "access": "public"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsdown",
    "test": "vitest run",
    "typecheck": "tsc -b"
  },
  "peerDependencies": {
    "@zeltjs/core": "workspace:*",
    "@zeltjs/kv": "workspace:*"
  },
  "devDependencies": {
    "@zeltjs/core": "workspace:*",
    "@zeltjs/kv": "workspace:*",
    "@types/node": "22.19.17",
    "hono": "4.12.16"
  }
}
```

## Usage Example

### IP 単位の login 制限

```typescript
import { Controller, Post, ip, validated } from '@zeltjs/core';
import { RateLimit } from '@zeltjs/rate-limit';

@Controller('/auth')
export class AuthController {
  @Post('/login')
  @RateLimit({ limit: 5, windowSec: 900, key: () => `login:${ip()}` })
  login(body = validated(LoginSchema)) { /* ... */ }
}
```

### IP + email 二重制限（スタッキング）

```typescript
@Post('/login')
@RateLimit({ limit: 20, windowSec: 60,  key: () => `login-ip:${ip()}` })
@RateLimit({ limit: 5,  windowSec: 900, key: () => `login-email:${validated(LoginSchema).email}` })
loginStrict(body = validated(LoginSchema)) { /* ... */ }
```

### 認証済みユーザー単位、未認証は IP fallback

```typescript
@Post('/expensive')
@RateLimit({
  limit: 10,
  windowSec: 86400,
  key: () => `expensive:${currentUser()?.id ?? ip()}`,
})
expensive() { /* ... */ }
```

### path param 単位（特定リソースへの集中アクセス制限）

```typescript
@Get('/posts/:id')
@RateLimit({ limit: 100, windowSec: 60, key: () => `post:${pathParam('id')}` })
getPost() { /* ... */ }
```

### 静的 key（global throttle）

```typescript
@Post('/global-protected')
@RateLimit({ limit: 1000, windowSec: 1, key: 'global' })
globalProtected() { /* ... */ }
```

### Service direct usage（動的 limit 等）

```typescript
@Injectable()
export class PaymentService {
  constructor(private rateLimiter = inject(RateLimiter)) {}

  async charge(userId: string, amount: number) {
    const limit = amount > 1000 ? 1 : 10;  // 動的 limit
    const result = await this.rateLimiter.hit(`charge:${userId}`, { limit, windowSec: 3600 });
    if (!result.allowed) throw new TooManyRequestsException(result);
    // process charge
  }
}
```

### Login 成功時の手動リセット

```typescript
@Controller('/auth')
export class AuthController {
  constructor(private rateLimiter = inject(RateLimiter)) {}

  @Post('/login')
  @RateLimit({ limit: 5, windowSec: 900, key: () => `login:${ip()}` })
  async login(body = validated(LoginSchema)) {
    const user = await authenticate(body.email, body.password);
    if (user) {
      await this.rateLimiter.reset(`login:${ip()}`);  // 成功時に解除
      return { token: signJwt(user) };
    }
    throw new HTTPException(401);
  }
}
```

## Error Handling

| Scenario | Response |
|---|---|
| Limit 超過 | 429 + `Retry-After` / `X-RateLimit-*` headers |
| KV 障害 (`failureMode='open'`) | 通す + warn log |
| KV 障害 (`failureMode='closed'`) | KV error を伝播（500 系の error として処理） |
| `key` 関数が throw | エラー伝播（user 責任） |
| `ip()` が unknown を返す | そのまま `'unknown'` を key に使う（IP 不明な状況でも一律制限） |

## Testing Strategy

- `RateLimiter.hit` のユニットテスト（fake `AtomicKVStore` 注入）
- `@RateLimit` decorator の統合テスト（`MemoryKV` で実 KV を使用）
- 複数スタッキング時の評価順テスト（最初の deny で短絡することを確認）
- `failureMode` 切替時の挙動テスト（KV を throw させて確認）
- response header の付与確認（429 と通常時両方）
- key 関数内で primitive が動作することの確認（`ip()`, `currentUser()`, `validated()`, `pathParam()`）
- 手動 `reset` のテスト

## Future Considerations

- **Sliding window counter algorithm** — 2 keys 分割で `incr` のみで実装可能、Config で `algorithm: 'fixed-window' | 'sliding-window'` を切替
- **Token bucket algorithm** — `cas` 必要、`AtomicKVStore` 拡張要
- **動的 limit / windowSec** — `() => number` を decorator で受付（key 関数と同じ流儀）
- **`@RateLimitGroup`** — controller 単位の共通設定
- **観測用メトリクス出力** — hit / deny カウンタを Logger or 別 metrics interface へ
- **Edge runtime 向け wai 整備** — `@zeltjs/kv-driver-upstash` / `@zeltjs/kv-driver-cloudflare` 提供後、CF Workers での動作確認
- **`IpConfig`** — `ip()` の trust proxy 順序を user が override 可能にする（rate-limit 文脈に限らず core 側機能として）
