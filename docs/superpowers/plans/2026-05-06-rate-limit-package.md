# @zeltjs/rate-limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@zeltjs/rate-limit` — Fixed-window rate limiter with `@RateLimit` decorator and a low-level `RateLimiter` service. Add `ip()` primitive to `@zeltjs/core`.

**Architecture:** `RateLimitConfig` (`@Config`) injects an `AtomicKVStore` (capability check at type level). `RateLimiter` (`@Injectable`) calls `store.incr` with TTL atomically. `@RateLimit` decorator generates a `FunctionMiddleware` and registers it via `UseMiddleware`. Key building uses zelt's primitive style (`ip()`, `currentUser()`) — no preset helpers.

**Tech Stack:** TypeScript ESM, vitest, tsdown, hono. Spec: `docs/superpowers/specs/2026-05-06-rate-limit-design.md`. Depends on `@zeltjs/kv` (`MemoryKV` for default config).

**Prerequisite:** `@zeltjs/kv` must be implemented first.

---

### Task 1: Add `ip()` primitive to `@zeltjs/core`

**Files:**
- Create: `packages/core/src/primitives/ip.ts`
- Create: `packages/core/src/primitives/ip.test.ts`
- Modify: `packages/core/src/index.ts`

`ip()` reads the request's source IP from common proxy headers, with a static fallback order. Trust-proxy customization is deferred to v2.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/primitives/ip.test.ts`:

```typescript
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { runInEntryContext } from '../internal/entry-context';
import { ip } from './ip';

const makeContext = (headers: Record<string, string>) => {
  const app = new Hono();
  let captured: unknown;
  app.get('/', (c) => {
    captured = c;
    return c.text('ok');
  });

  return new Promise<unknown>((resolve) => {
    void app.request('/', { headers }).then(() => resolve(captured));
  });
};

describe('ip primitive', () => {
  it('reads cf-connecting-ip first', async () => {
    const honoContext = await makeContext({
      'cf-connecting-ip': '1.1.1.1',
      'x-forwarded-for': '2.2.2.2',
    });
    runInEntryContext(
      // @ts-expect-error narrow typed test fixture
      { honoContext, input: { jsonBody: undefined, formBody: undefined, pathParams: {} } },
      () => {
        expect(ip()).toBe('1.1.1.1');
      },
    );
  });

  it('falls back to x-real-ip when cf header missing', async () => {
    const honoContext = await makeContext({
      'x-real-ip': '3.3.3.3',
      'x-forwarded-for': '2.2.2.2',
    });
    runInEntryContext(
      // @ts-expect-error narrow typed test fixture
      { honoContext, input: { jsonBody: undefined, formBody: undefined, pathParams: {} } },
      () => {
        expect(ip()).toBe('3.3.3.3');
      },
    );
  });

  it('falls back to first x-forwarded-for entry', async () => {
    const honoContext = await makeContext({
      'x-forwarded-for': '4.4.4.4, 5.5.5.5',
    });
    runInEntryContext(
      // @ts-expect-error narrow typed test fixture
      { honoContext, input: { jsonBody: undefined, formBody: undefined, pathParams: {} } },
      () => {
        expect(ip()).toBe('4.4.4.4');
      },
    );
  });

  it('returns "unknown" when no headers available', async () => {
    const honoContext = await makeContext({});
    runInEntryContext(
      // @ts-expect-error narrow typed test fixture
      { honoContext, input: { jsonBody: undefined, formBody: undefined, pathParams: {} } },
      () => {
        expect(ip()).toBe('unknown');
      },
    );
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @zeltjs/core test ip`
Expected: FAIL with module not found.

- [ ] **Step 3: Create `packages/core/src/primitives/ip.ts`**

```typescript
import { getEntryContext } from '../internal/entry-context';

export const ip = (): string => {
  const honoCtx = getEntryContext().honoContext;
  return (
    honoCtx.req.header('cf-connecting-ip') ??
    honoCtx.req.header('x-real-ip') ??
    honoCtx.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
};
```

- [ ] **Step 4: Add export to `packages/core/src/index.ts`**

Find the existing primitive exports section (lines ~32-45 of current `index.ts`) and append:

```typescript
export { ip } from './primitives/ip';
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @zeltjs/core test ip`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/primitives/ip.ts packages/core/src/primitives/ip.test.ts packages/core/src/index.ts
git commit -m "feat(core): add ip() primitive for request IP resolution"
```

---

### Task 2: Package skeleton for `@zeltjs/rate-limit`

**Files:**
- Create: `packages/rate-limit/package.json`
- Create: `packages/rate-limit/tsconfig.json`
- Create: `packages/rate-limit/tsdown.config.ts`
- Create: `packages/rate-limit/src/index.ts`
- Modify: `tsconfig.json` (add reference)

- [ ] **Step 1: Create `packages/rate-limit/package.json`**

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

- [ ] **Step 2: Create `packages/rate-limit/tsconfig.json`**

```json
{
  "extends": "@9wick/eslint-plugin-strict-type-rules/tsconfig/strictest.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
    "experimentalDecorators": true,
    "erasableSyntaxOnly": false,
    "types": ["node"]
  },
  "references": [
    { "path": "../core" },
    { "path": "../kv" }
  ],
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/rate-limit/tsdown.config.ts`**

```typescript
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    neverBundle: [
      '@zeltjs/core',
      /^@zeltjs\/core\//,
      '@zeltjs/kv',
      /^@zeltjs\/kv\//,
      'hono',
      /^hono\//,
    ],
  },
});
```

- [ ] **Step 4: Create empty `packages/rate-limit/src/index.ts`**

```typescript
export {};
```

- [ ] **Step 5: Add reference to root `tsconfig.json`**

Append `{ "path": "packages/rate-limit" }` to the `references` array.

- [ ] **Step 6: Install**

Run: `pnpm install`
Expected: success.

- [ ] **Step 7: Verify**

Run: `pnpm --filter @zeltjs/rate-limit typecheck && pnpm --filter @zeltjs/rate-limit build`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add packages/rate-limit tsconfig.json pnpm-lock.yaml
git commit -m "feat(rate-limit): add package skeleton"
```

---

### Task 3: Types and errors

**Files:**
- Create: `packages/rate-limit/src/types.ts`
- Create: `packages/rate-limit/src/errors.ts`
- Create: `packages/rate-limit/src/errors.test.ts`

- [ ] **Step 1: Create `packages/rate-limit/src/types.ts`**

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

- [ ] **Step 2: Write the failing test for `TooManyRequestsException`**

Create `packages/rate-limit/src/errors.test.ts`:

```typescript
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';

import { TooManyRequestsException } from './errors';

describe('TooManyRequestsException', () => {
  it('extends HTTPException with status 429', () => {
    const err = new TooManyRequestsException({
      allowed: false,
      remaining: 0,
      limit: 5,
      retryAfterSec: 60,
    });
    expect(err).toBeInstanceOf(HTTPException);
    expect(err.status).toBe(429);
  });

  it('returns a Response with rate-limit headers and JSON body', async () => {
    const err = new TooManyRequestsException({
      allowed: false,
      remaining: 0,
      limit: 5,
      retryAfterSec: 60,
    });
    const res = err.getResponse();
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(await res.json()).toEqual({ code: 'RATE_LIMIT_EXCEEDED', retryAfterSec: 60 });
  });
});
```

- [ ] **Step 3: Run, verify it fails**

Run: `pnpm --filter @zeltjs/rate-limit test errors`
Expected: FAIL.

- [ ] **Step 4: Create `packages/rate-limit/src/errors.ts`**

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

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @zeltjs/rate-limit test errors`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/rate-limit/src/types.ts packages/rate-limit/src/errors.ts packages/rate-limit/src/errors.test.ts
git commit -m "feat(rate-limit): add types and TooManyRequestsException"
```

---

### Task 4: RateLimitConfig

**Files:**
- Create: `packages/rate-limit/src/rate-limit.config.ts`
- Create: `packages/rate-limit/src/rate-limit.config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/rate-limit/src/rate-limit.config.test.ts`:

```typescript
import { Container } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { RateLimitConfig } from './rate-limit.config';

describe('RateLimitConfig', () => {
  it('Token is the class itself', () => {
    expect(RateLimitConfig.Token).toBe(RateLimitConfig);
  });

  it('default limit is 100', () => {
    const config = new Container().get(RateLimitConfig);
    expect(config.defaultLimit).toBe(100);
  });

  it('default windowSec is 60', () => {
    const config = new Container().get(RateLimitConfig);
    expect(config.defaultWindowSec).toBe(60);
  });

  it('default failureMode is open', () => {
    const config = new Container().get(RateLimitConfig);
    expect(config.failureMode).toBe('open');
  });

  it('store is namespaced AtomicKVStore', async () => {
    const config = new Container().get(RateLimitConfig);
    await config.store.set('foo', 1);
    expect(await config.store.get('foo')).toBe(1);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @zeltjs/rate-limit test rate-limit.config`
Expected: FAIL.

- [ ] **Step 3: Create `packages/rate-limit/src/rate-limit.config.ts`**

```typescript
import { Config, inject } from '@zeltjs/core';
import { MemoryKV, type AtomicKVStore } from '@zeltjs/kv';

@Config
export class RateLimitConfig {
  static readonly Token = RateLimitConfig;

  readonly store: AtomicKVStore;

  constructor(kv = inject(MemoryKV)) {
    this.store = kv.namespace('rate-limit:');
  }

  defaultLimit = 100;
  defaultWindowSec = 60;
  failureMode: 'open' | 'closed' = 'open';
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @zeltjs/rate-limit test rate-limit.config`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/rate-limit/src/rate-limit.config.ts packages/rate-limit/src/rate-limit.config.test.ts
git commit -m "feat(rate-limit): add RateLimitConfig"
```

---

### Task 5: RateLimiter service

**Files:**
- Create: `packages/rate-limit/src/rate-limiter.service.ts`
- Create: `packages/rate-limit/src/rate-limiter.service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/rate-limit/src/rate-limiter.service.test.ts`:

```typescript
import { Container } from '@needle-di/core';
import { Config } from '@zeltjs/core';
import { MemoryKV, type AtomicKVStore } from '@zeltjs/kv';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RateLimitConfig } from './rate-limit.config';
import { RateLimiter } from './rate-limiter.service';

describe('RateLimiter', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  it('hit returns allowed=true within limit', async () => {
    const limiter = container.get(RateLimiter);
    const r = await limiter.hit('test:k1', { limit: 3, windowSec: 60 });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
    expect(r.limit).toBe(3);
  });

  it('hit returns allowed=false after limit exceeded', async () => {
    const limiter = container.get(RateLimiter);
    await limiter.hit('test:k2', { limit: 2, windowSec: 60 });
    await limiter.hit('test:k2', { limit: 2, windowSec: 60 });
    const r = await limiter.hit('test:k2', { limit: 2, windowSec: 60 });
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfterSec).toBe(60);
  });

  it('uses Config defaults when opts omitted', async () => {
    const limiter = container.get(RateLimiter);
    const r = await limiter.hit('test:k3');
    expect(r.limit).toBe(100);
  });

  it('reset deletes the counter', async () => {
    const limiter = container.get(RateLimiter);
    await limiter.hit('test:k4', { limit: 1, windowSec: 60 });
    await limiter.reset('test:k4');
    const r = await limiter.hit('test:k4', { limit: 1, windowSec: 60 });
    expect(r.allowed).toBe(true);
  });

  it('failureMode=open returns allowed when store throws', async () => {
    container = new Container();
    // Override config: store that always throws
    @Config
    class FailingConfig extends RateLimitConfig {
      static override readonly Token = RateLimitConfig;
      override readonly store = {
        incr: vi.fn().mockRejectedValue(new Error('boom')),
        del: vi.fn(),
      } as unknown as AtomicKVStore;
    }
    container.bind({ provide: RateLimitConfig, useClass: FailingConfig });
    const limiter = container.get(RateLimiter);
    const r = await limiter.hit('test:k5', { limit: 5, windowSec: 60 });
    expect(r.allowed).toBe(true);
  });

  it('failureMode=closed propagates store errors', async () => {
    container = new Container();
    @Config
    class FailingClosed extends RateLimitConfig {
      static override readonly Token = RateLimitConfig;
      override readonly store = {
        incr: vi.fn().mockRejectedValue(new Error('boom')),
        del: vi.fn(),
      } as unknown as AtomicKVStore;
      override failureMode: 'open' | 'closed' = 'closed';
    }
    container.bind({ provide: RateLimitConfig, useClass: FailingClosed });
    const limiter = container.get(RateLimiter);
    await expect(limiter.hit('test:k6', { limit: 5, windowSec: 60 })).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @zeltjs/rate-limit test rate-limiter.service`
Expected: FAIL.

- [ ] **Step 3: Create `packages/rate-limit/src/rate-limiter.service.ts`**

The `Logger` injection from spec is used for warnings. If `@zeltjs/core` does not yet export a `Logger` token, omit it for v1 — fall back to `console.warn`.

```typescript
import { Injectable, injectConfig } from '@zeltjs/core';

import { RateLimitConfig } from './rate-limit.config';
import type { RateLimitResult } from './types';

@Injectable()
export class RateLimiter {
  constructor(private config = injectConfig(RateLimitConfig)) {}

  async hit(
    key: string,
    opts?: { limit?: number; windowSec?: number },
  ): Promise<RateLimitResult> {
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
      console.warn('rate-limit: KV failure', { err, key });
      if (this.config.failureMode === 'closed') throw err;
      return { allowed: true, remaining: limit, limit, retryAfterSec: 0 };
    }
  }

  async reset(key: string): Promise<void> {
    await this.config.store.del(key);
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @zeltjs/rate-limit test rate-limiter.service`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/rate-limit/src/rate-limiter.service.ts packages/rate-limit/src/rate-limiter.service.test.ts
git commit -m "feat(rate-limit): add RateLimiter service"
```

---

### Task 6: @RateLimit decorator

**Files:**
- Create: `packages/rate-limit/src/rate-limit.decorator.ts`
- Create: `packages/rate-limit/src/rate-limit.decorator.test.ts`

The decorator generates a function middleware closing over the options, and registers it via `UseMiddleware`. Inside the middleware, the `key` function (if provided) is called within hono's request scope. The key function should be invoked via `runInEntryContext` if not already in one — but for middleware running before the entry handler, we need to ensure the entry context is established first.

> Implementation note: zelt's `runInEntryContext` is set by the route builder before the handler runs. Middlewares run inside the same hono context but may be before the entry-context is set. Verify during implementation: if `getEntryContext()` is unavailable in middleware, the key function must accept the hono `Context` directly. Inspect `packages/core/src/internal/route-builder.ts` to confirm timing.

For this plan we assume `getEntryContext()` is available inside middleware (since it's set by the route builder ahead of middleware chain). If not, adjust the key signature to `(c: Context) => string` and update tests accordingly.

- [ ] **Step 1: Write the failing test**

Create `packages/rate-limit/src/rate-limit.decorator.test.ts`:

```typescript
import { Controller, Get, createHttpApp } from '@zeltjs/core';
import { describe, expect, it } from 'vitest';

import { RateLimit } from './rate-limit.decorator';

describe('@RateLimit decorator', () => {
  it('allows requests within limit, blocks after', async () => {
    @Controller('/')
    class TestController {
      @Get('/limited')
      @RateLimit({ limit: 2, windowSec: 60, key: 'test:limited' })
      hit() {
        return { ok: true };
      }
    }

    const app = createHttpApp({ controllers: [TestController] });

    const r1 = await app.request('/limited');
    expect(r1.status).toBe(200);

    const r2 = await app.request('/limited');
    expect(r2.status).toBe(200);

    const r3 = await app.request('/limited');
    expect(r3.status).toBe(429);
    expect(r3.headers.get('Retry-After')).toBe('60');
  });

  it('sets X-RateLimit headers on success', async () => {
    @Controller('/')
    class TestController {
      @Get('/headers')
      @RateLimit({ limit: 5, windowSec: 60, key: 'test:headers' })
      hit() {
        return { ok: true };
      }
    }
    const app = createHttpApp({ controllers: [TestController] });
    const res = await app.request('/headers');
    expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('4');
  });

  it('evaluates dynamic key function per request', async () => {
    let counter = 0;
    @Controller('/')
    class TestController {
      @Get('/dyn')
      @RateLimit({
        limit: 1,
        windowSec: 60,
        key: () => `test:dyn:${counter++}`,
      })
      hit() {
        return { ok: true };
      }
    }
    const app = createHttpApp({ controllers: [TestController] });
    // Different keys per request → both succeed
    const r1 = await app.request('/dyn');
    const r2 = await app.request('/dyn');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  it('stacking: both decorators must allow', async () => {
    @Controller('/')
    class TestController {
      @Get('/stack')
      @RateLimit({ limit: 10, windowSec: 60, key: 'test:stack:loose' })
      @RateLimit({ limit: 1, windowSec: 60, key: 'test:stack:strict' })
      hit() {
        return { ok: true };
      }
    }
    const app = createHttpApp({ controllers: [TestController] });
    const r1 = await app.request('/stack');
    expect(r1.status).toBe(200);
    const r2 = await app.request('/stack');
    // strict limit (1) blocks the second
    expect(r2.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @zeltjs/rate-limit test rate-limit.decorator`
Expected: FAIL.

- [ ] **Step 3: Create `packages/rate-limit/src/rate-limit.decorator.ts`**

```typescript
import { inject, UseMiddleware, type FunctionMiddleware } from '@zeltjs/core';

import { TooManyRequestsException } from './errors';
import { RateLimiter } from './rate-limiter.service';
import type { RateLimitOptions } from './types';

export const RateLimit = (opts: RateLimitOptions) => {
  const middleware: FunctionMiddleware = async (c, next) => {
    const limiter = inject(RateLimiter);
    const key = typeof opts.key === 'string' ? opts.key : opts.key();
    const result = await limiter.hit(key, {
      limit: opts.limit,
      windowSec: opts.windowSec,
    });

    c.header('X-RateLimit-Limit', String(result.limit));
    c.header('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) throw new TooManyRequestsException(result);
    await next();
  };

  return UseMiddleware(middleware);
};
```

> If during implementation `inject()` cannot resolve inside a function middleware (because needle-di context isn't established), change the strategy to a `MiddlewareClass`:
>
> ```typescript
> @Middleware()
> class RateLimitMw {
>   constructor(private limiter = inject(RateLimiter), private opts: RateLimitOptions) {}
>   async use(c, next) { ... }
> }
> ```
>
> and have `RateLimit(opts)` return `UseMiddleware(class extends RateLimitMw { ... })` per call. Adjust before continuing.

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @zeltjs/rate-limit test rate-limit.decorator`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/rate-limit/src/rate-limit.decorator.ts packages/rate-limit/src/rate-limit.decorator.test.ts
git commit -m "feat(rate-limit): add @RateLimit decorator"
```

---

### Task 7: Public exports

**Files:**
- Modify: `packages/rate-limit/src/index.ts`

- [ ] **Step 1: Replace `packages/rate-limit/src/index.ts`**

```typescript
export { RateLimit } from './rate-limit.decorator';
export { RateLimitConfig } from './rate-limit.config';
export { RateLimiter } from './rate-limiter.service';
export { TooManyRequestsException } from './errors';
export type { RateLimitOptions, RateLimitResult } from './types';
```

- [ ] **Step 2: Verify build**

Run: `pnpm --filter @zeltjs/rate-limit build`
Expected: `dist/index.{js,d.ts}` produced.

- [ ] **Step 3: Verify all tests pass**

Run: `pnpm --filter @zeltjs/rate-limit test`
Expected: PASS.

- [ ] **Step 4: Verify root typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rate-limit/src/index.ts
git commit -m "feat(rate-limit): finalize public exports"
```

---

### Task 8: End-to-end usage example with primitives

**Files:**
- Create: `packages/rate-limit/src/integration.test.ts`

Verify the full primitive composition works: `ip()`, `currentUser()`, `validated()` inside the key function.

- [ ] **Step 1: Write the integration test**

Create `packages/rate-limit/src/integration.test.ts`:

```typescript
import { Controller, Post, createHttpApp, ip, validated } from '@zeltjs/core';
import { object, string } from 'valibot';
import { describe, expect, it } from 'vitest';

import { RateLimit } from './rate-limit.decorator';

const LoginSchema = object({ email: string() });

describe('rate-limit integration with primitives', () => {
  it('uses ip() in dynamic key', async () => {
    @Controller('/auth')
    class AuthController {
      @Post('/login')
      @RateLimit({ limit: 1, windowSec: 60, key: () => `login:${ip()}` })
      login(_body = validated(LoginSchema)) {
        return { ok: true };
      }
    }

    const app = createHttpApp({ controllers: [AuthController] });

    const r1 = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.1.1.1' },
      body: JSON.stringify({ email: 'a@a' }),
    });
    expect(r1.status).toBe(200);

    // Same IP — blocked
    const r2 = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '1.1.1.1' },
      body: JSON.stringify({ email: 'a@a' }),
    });
    expect(r2.status).toBe(429);

    // Different IP — allowed
    const r3 = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '2.2.2.2' },
      body: JSON.stringify({ email: 'a@a' }),
    });
    expect(r3.status).toBe(200);
  });

  it('uses validated() in dynamic key (per-email rate limit)', async () => {
    @Controller('/auth')
    class AuthController {
      @Post('/login')
      @RateLimit({
        limit: 1,
        windowSec: 60,
        key: () => `login:${validated(LoginSchema).email}`,
      })
      login(_body = validated(LoginSchema)) {
        return { ok: true };
      }
    }

    const app = createHttpApp({ controllers: [AuthController] });

    const r1 = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@a' }),
    });
    expect(r1.status).toBe(200);

    const r2 = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@a' }),
    });
    expect(r2.status).toBe(429);

    const r3 = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'b@b' }),
    });
    expect(r3.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `pnpm --filter @zeltjs/rate-limit test integration`
Expected: PASS (2 tests).

> If `validated()` inside the `key` fn double-parses (since the handler also calls it), confirm the behavior — it parses the body twice, which is wasteful but correct. If it fails because hono consumes body once, switch to caching the parsed body in entry context (out of scope for this plan; flag for follow-up).

- [ ] **Step 3: Commit**

```bash
git add packages/rate-limit/src/integration.test.ts
git commit -m "test(rate-limit): integration tests with ip() and validated()"
```

---

## Verification Checklist (run before declaring done)

- [ ] `pnpm --filter @zeltjs/core test ip` — `ip()` primitive tests pass
- [ ] `pnpm --filter @zeltjs/rate-limit test` — all suites pass
- [ ] `pnpm --filter @zeltjs/rate-limit build` — produces `dist/index.{js,d.ts}`
- [ ] `pnpm --filter @zeltjs/rate-limit typecheck` — clean
- [ ] `pnpm typecheck` — root project clean
- [ ] `pnpm lint` — clean
- [ ] `@RateLimit` decorator works with both static and dynamic keys
- [ ] Dynamic keys can compose `ip()`, `currentUser()`, `validated()`, `pathParam()`
- [ ] `failureMode='open'` and `'closed'` both verified
- [ ] 429 response includes `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` headers
- [ ] Each task = its own commit
