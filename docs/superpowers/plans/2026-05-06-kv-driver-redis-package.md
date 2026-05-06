# @zeltjs/kv-driver-redis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@zeltjs/kv-driver-redis` — a Node.js Redis driver that implements `AtomicKVDriver` from `@zeltjs/kv`, with Lua-backed atomic ops and a `RedisConfig` for env-driven setup.

**Architecture:** `RedisConfig` (`@Config`) reads `REDIS_URL`. `RedisKV` (`@Injectable`, `Disposable`) creates a single `ioredis` client. `RedisKVStore` is the namespaced view. Atomic ops (`incr+ttl`, `setnx+ttl`, `delIf`) ship as Lua scripts via `defineCommand`.

**Tech Stack:** TypeScript ESM, ioredis@5, vitest, tsdown, testcontainers (or local Redis). Spec: `docs/superpowers/specs/2026-05-06-kv-driver-redis-design.md`. Depends on `@zeltjs/kv` (plan: `2026-05-06-kv-package.md`).

**Prerequisite:** `@zeltjs/kv` must be implemented first (Task 9 of that plan complete).

---

### Task 1: Package skeleton

**Files:**
- Create: `packages/kv-driver-redis/package.json`
- Create: `packages/kv-driver-redis/tsconfig.json`
- Create: `packages/kv-driver-redis/tsdown.config.ts`
- Create: `packages/kv-driver-redis/src/index.ts`
- Modify: `tsconfig.json` (add reference)

- [ ] **Step 1: Create `packages/kv-driver-redis/package.json`**

```json
{
  "name": "@zeltjs/kv-driver-redis",
  "version": "0.1.0",
  "type": "module",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/zeltjs/zelt.git",
    "directory": "packages/kv-driver-redis"
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
  "dependencies": {
    "ioredis": "5.7.0"
  },
  "devDependencies": {
    "@zeltjs/core": "workspace:*",
    "@zeltjs/kv": "workspace:*",
    "@types/node": "22.19.17"
  }
}
```

> Note: Confirm `ioredis@5.7.0` is the latest stable when running `pnpm install`. If a newer minor exists, pin to it. The exact version requirement is from CLAUDE.md ("Specify exact versions").

- [ ] **Step 2: Create `packages/kv-driver-redis/tsconfig.json`**

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

- [ ] **Step 3: Create `packages/kv-driver-redis/tsdown.config.ts`**

```typescript
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    neverBundle: ['@zeltjs/core', /^@zeltjs\/core\//, '@zeltjs/kv', /^@zeltjs\/kv\//, 'ioredis'],
  },
});
```

- [ ] **Step 4: Create empty `packages/kv-driver-redis/src/index.ts`**

```typescript
export {};
```

- [ ] **Step 5: Add reference to root `tsconfig.json`**

Append `{ "path": "packages/kv-driver-redis" }` to the `references` array.

- [ ] **Step 6: Install**

Run: `pnpm install`
Expected: success.

- [ ] **Step 7: Verify build & typecheck**

Run: `pnpm --filter @zeltjs/kv-driver-redis typecheck && pnpm --filter @zeltjs/kv-driver-redis build`
Expected: clean build with `dist/index.{js,d.ts}`.

- [ ] **Step 8: Commit**

```bash
git add packages/kv-driver-redis tsconfig.json pnpm-lock.yaml
git commit -m "feat(kv-driver-redis): add package skeleton"
```

---

### Task 2: RedisConfig

**Files:**
- Create: `packages/kv-driver-redis/src/redis.config.ts`
- Create: `packages/kv-driver-redis/src/redis.config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/kv-driver-redis/src/redis.config.test.ts`:

```typescript
import { Container } from '@needle-di/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RedisConfig } from './redis.config';

describe('RedisConfig', () => {
  const original = process.env.REDIS_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = original;
  });

  it('defaults url to redis://localhost:6379 when REDIS_URL unset', () => {
    delete process.env.REDIS_URL;
    const config = new Container().get(RedisConfig);
    expect(config.url).toBe('redis://localhost:6379');
  });

  it('reads url from REDIS_URL when set', () => {
    process.env.REDIS_URL = 'redis://example.com:6380';
    const config = new Container().get(RedisConfig);
    expect(config.url).toBe('redis://example.com:6380');
  });

  it('default options is empty', () => {
    const config = new Container().get(RedisConfig);
    expect(config.options).toEqual({});
  });

  it('Token is the class itself', () => {
    expect(RedisConfig.Token).toBe(RedisConfig);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @zeltjs/kv-driver-redis test redis.config`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `packages/kv-driver-redis/src/redis.config.ts`**

```typescript
import { Config } from '@zeltjs/core';
import type { RedisOptions } from 'ioredis';

@Config
export class RedisConfig {
  static readonly Token = RedisConfig;

  /** 接続 URL。default は REDIS_URL 環境変数。 */
  get url(): string {
    return process.env.REDIS_URL ?? 'redis://localhost:6379';
  }

  /** ioredis オプションの override 用。 */
  get options(): RedisOptions {
    return {};
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @zeltjs/kv-driver-redis test redis.config`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/kv-driver-redis/src/redis.config.ts packages/kv-driver-redis/src/redis.config.test.ts
git commit -m "feat(kv-driver-redis): add RedisConfig"
```

---

### Task 3: Lua scripts (string constants)

**Files:**
- Create: `packages/kv-driver-redis/src/lua-scripts.ts`

These are pure string constants — no behavior to test in isolation. They will be exercised in subsequent tasks via integration tests.

- [ ] **Step 1: Create `packages/kv-driver-redis/src/lua-scripts.ts`**

```typescript
/** 最初の incr 時にのみ EXPIRE を発行 (TTL 延長を防ぐ) */
export const INCR_WITH_TTL_LUA = `
  local v = redis.call('INCRBY', KEYS[1], ARGV[1])
  if v == tonumber(ARGV[1]) and ARGV[2] ~= '' then
    redis.call('EXPIRE', KEYS[1], ARGV[2])
  end
  return v
`;

/** SET NX EX を 1 コマンドで (NX と EX の race を回避) */
export const SETNX_WITH_TTL_LUA = `
  if redis.call('EXISTS', KEYS[1]) == 1 then
    return 0
  end
  if ARGV[2] ~= '' then
    redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
  else
    redis.call('SET', KEYS[1], ARGV[1])
  end
  return 1
`;

/** 値一致時のみ削除 (lock release で他人の lock を消さない) */
export const DEL_IF_LUA = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @zeltjs/kv-driver-redis typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/kv-driver-redis/src/lua-scripts.ts
git commit -m "feat(kv-driver-redis): add Lua scripts for atomic ops"
```

---

### Task 4: RedisKVStore (namespaced view)

**Files:**
- Create: `packages/kv-driver-redis/src/redis-kv-store.ts`

This file is implementation-only. It will be tested via the compliance suite in Task 6 (which exercises every method against a real Redis). We do not write isolated unit tests because the methods are thin shims over `ioredis`.

- [ ] **Step 1: Create `packages/kv-driver-redis/src/redis-kv-store.ts`**

```typescript
import {
  assertNonEmptyPrefix,
  joinPrefix,
  KVError,
  type AtomicKVStore,
  type SetOptions,
} from '@zeltjs/kv';
import type Redis from 'ioredis';

interface RedisWithCustomCommands extends Redis {
  zeltIncrWithTtl(key: string, by: number, ttlOrEmpty: string): Promise<number>;
  zeltSetnxWithTtl(key: string, value: string, ttlOrEmpty: string): Promise<number>;
  zeltDelIf(key: string, expected: string): Promise<number>;
}

export class RedisKVStore implements AtomicKVStore {
  constructor(
    private readonly client: RedisWithCustomCommands,
    private readonly prefix: string,
  ) {
    assertNonEmptyPrefix(prefix);
  }

  private k(key: string): string {
    return this.prefix + key;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(this.k(key));
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T, opts?: SetOptions): Promise<void> {
    if (value === undefined) throw new KVError('cannot set undefined');
    const json = JSON.stringify(value);
    if (opts?.ttlSec !== undefined) {
      await this.client.set(this.k(key), json, 'EX', opts.ttlSec);
    } else {
      await this.client.set(this.k(key), json);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(this.k(key));
  }

  async has(key: string): Promise<boolean> {
    return (await this.client.exists(this.k(key))) === 1;
  }

  async expire(key: string, ttlSec: number): Promise<boolean> {
    return (await this.client.expire(this.k(key), ttlSec)) === 1;
  }

  namespace(sub: string): AtomicKVStore {
    assertNonEmptyPrefix(sub);
    return new RedisKVStore(this.client, joinPrefix(this.prefix, sub));
  }

  async incr(key: string, by = 1, opts?: { ttlSec?: number }): Promise<number> {
    return await this.client.zeltIncrWithTtl(this.k(key), by, String(opts?.ttlSec ?? ''));
  }

  async setnx<T>(key: string, value: T, opts?: SetOptions): Promise<boolean> {
    if (value === undefined) throw new KVError('cannot setnx undefined');
    const result = await this.client.zeltSetnxWithTtl(
      this.k(key),
      JSON.stringify(value),
      String(opts?.ttlSec ?? ''),
    );
    return result === 1;
  }

  async delIf(key: string, expected: unknown): Promise<boolean> {
    const result = await this.client.zeltDelIf(this.k(key), JSON.stringify(expected));
    return result === 1;
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @zeltjs/kv-driver-redis typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/kv-driver-redis/src/redis-kv-store.ts
git commit -m "feat(kv-driver-redis): add RedisKVStore namespaced view"
```

---

### Task 5: RedisKV driver

**Files:**
- Create: `packages/kv-driver-redis/src/redis-kv.ts`

- [ ] **Step 1: Create `packages/kv-driver-redis/src/redis-kv.ts`**

```typescript
import { Injectable, injectConfig, type Disposable } from '@zeltjs/core';
import {
  assertNonEmptyPrefix,
  type AtomicKVDriver,
  type AtomicKVStore,
} from '@zeltjs/kv';
import Redis from 'ioredis';

import { DEL_IF_LUA, INCR_WITH_TTL_LUA, SETNX_WITH_TTL_LUA } from './lua-scripts';
import { RedisConfig } from './redis.config';
import { RedisKVStore } from './redis-kv-store';

@Injectable()
export class RedisKV implements AtomicKVDriver, Disposable {
  private readonly client: Redis;

  constructor(config = injectConfig(RedisConfig)) {
    this.client = new Redis(config.url, config.options);
    this.registerLuaScripts();
  }

  namespace(prefix: string): AtomicKVStore {
    assertNonEmptyPrefix(prefix);
    return new RedisKVStore(this.client as never, prefix);
  }

  dispose() {
    this.client.disconnect();
  }

  private registerLuaScripts(): void {
    this.client.defineCommand('zeltIncrWithTtl', {
      numberOfKeys: 1,
      lua: INCR_WITH_TTL_LUA,
    });
    this.client.defineCommand('zeltSetnxWithTtl', {
      numberOfKeys: 1,
      lua: SETNX_WITH_TTL_LUA,
    });
    this.client.defineCommand('zeltDelIf', {
      numberOfKeys: 1,
      lua: DEL_IF_LUA,
    });
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @zeltjs/kv-driver-redis typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/kv-driver-redis/src/redis-kv.ts
git commit -m "feat(kv-driver-redis): add RedisKV driver"
```

---

### Task 6: Compliance test against real Redis

**Files:**
- Create: `packages/kv-driver-redis/src/compliance.test.ts`
- Create: `packages/kv-driver-redis/vitest.config.ts` (only if needed for setup)

This test requires a real Redis instance. We assume one is reachable at `REDIS_URL` (default `redis://localhost:6379`). Local devs run `docker run --rm -p 6379:6379 redis:7` before testing.

- [ ] **Step 1: Create `packages/kv-driver-redis/src/compliance.test.ts`**

```typescript
import { runAtomicKVStoreComplianceTests } from '@zeltjs/kv/testing';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import Redis from 'ioredis';

import { RedisKV } from './redis-kv';

const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

beforeAll(async () => {
  const probe = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
  await probe.connect();
  await probe.quit();
});

let driver: RedisKV;

beforeEach(async () => {
  driver = new RedisKV();
  // 各テスト前に既存キーをクリア (compliance: で始まるものだけ)
  const client = (driver as unknown as { client: Redis }).client;
  const keys = await client.keys('compliance*');
  if (keys.length > 0) await client.del(...keys);
  const atomicKeys = await client.keys('atomic*');
  if (atomicKeys.length > 0) await client.del(...atomicKeys);
});

afterAll(() => {
  driver?.dispose();
});

runAtomicKVStoreComplianceTests(() => driver);
```

> Note: `vi.useFakeTimers()` from the compliance suite cannot fast-forward Redis TTL — Redis ticks in real time. The TTL tests in the compliance suite use small `ttlSec` values (10s) plus `vi.advanceTimersByTime(11_000)`; on Redis those advances are no-ops because Redis sees real wall clock. To handle this, the compliance suite TTL tests will not actually expire keys against Redis — but the suite still validates that `set` accepts the option without error and `expire` returns boolean correctly.
>
> If TTL expiry coverage against real Redis is required, add a separate test file in Task 7 below.

- [ ] **Step 2: Run compliance tests**

Start Redis if not running:
```bash
docker run --rm -d --name zelt-redis-test -p 6379:6379 redis:7
```

Run: `pnpm --filter @zeltjs/kv-driver-redis test compliance`
Expected: PASS for all non-TTL tests; TTL tests pass because the suite uses fake timers but doesn't strictly require expiry against Redis (key visibility check passes regardless).

If TTL tests fail because compliance suite assertions assume in-memory expiry: see Task 7.

- [ ] **Step 3: Stop Redis (cleanup)**

```bash
docker stop zelt-redis-test
```

- [ ] **Step 4: Commit**

```bash
git add packages/kv-driver-redis/src/compliance.test.ts
git commit -m "test(kv-driver-redis): run KV compliance suite against real Redis"
```

---

### Task 7: Real-time TTL test (Redis-specific)

**Files:**
- Create: `packages/kv-driver-redis/src/ttl.test.ts`

The compliance suite uses fake timers which don't affect Redis. We need real-clock TTL tests for Redis-specific verification. These tests are slow (use 1-2s sleeps) and are kept separate.

- [ ] **Step 1: Create `packages/kv-driver-redis/src/ttl.test.ts`**

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Redis from 'ioredis';

import { RedisKV } from './redis-kv';

const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('RedisKV TTL (real-clock)', () => {
  let driver: RedisKV;

  beforeAll(async () => {
    const probe = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
    await probe.connect();
    await probe.quit();
  });

  beforeEach(async () => {
    driver = new RedisKV();
    const client = (driver as unknown as { client: Redis }).client;
    const keys = await client.keys('ttl-test*');
    if (keys.length > 0) await client.del(...keys);
  });

  afterAll(() => {
    driver?.dispose();
  });

  it('set with ttlSec=1 expires after ~1.5s', async () => {
    const store = driver.namespace('ttl-test:');
    await store.set('foo', 1, { ttlSec: 1 });
    expect(await store.get('foo')).toBe(1);
    await sleep(1500);
    expect(await store.get('foo')).toBeUndefined();
  });

  it('incr with ttlSec=1 sets TTL only on first call', async () => {
    const store = driver.namespace('ttl-test:');
    await store.incr('counter', 1, { ttlSec: 1 });
    await sleep(500);
    // 2 度目: 大きな ttlSec を渡しても TTL は延長されない
    await store.incr('counter', 1, { ttlSec: 100 });
    await sleep(800);
    expect(await store.get('counter')).toBeUndefined();
  });

  it('setnx with ttlSec sets expiry', async () => {
    const store = driver.namespace('ttl-test:');
    await store.setnx('lock', 'token', { ttlSec: 1 });
    await sleep(1500);
    expect(await store.get('lock')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run real-clock TTL tests**

Ensure Redis is running, then:

Run: `pnpm --filter @zeltjs/kv-driver-redis test ttl`
Expected: PASS (3 tests, takes ~5-6 seconds).

- [ ] **Step 3: Commit**

```bash
git add packages/kv-driver-redis/src/ttl.test.ts
git commit -m "test(kv-driver-redis): add real-clock TTL tests"
```

---

### Task 8: Public exports

**Files:**
- Modify: `packages/kv-driver-redis/src/index.ts`

- [ ] **Step 1: Replace `packages/kv-driver-redis/src/index.ts`**

```typescript
export { RedisConfig } from './redis.config';
export { RedisKV } from './redis-kv';
```

- [ ] **Step 2: Verify build**

Run: `pnpm --filter @zeltjs/kv-driver-redis build`
Expected: `dist/index.{js,d.ts}` produced.

- [ ] **Step 3: Verify all package tests pass (Redis must be running)**

Run: `pnpm --filter @zeltjs/kv-driver-redis test`
Expected: PASS.

- [ ] **Step 4: Verify root typecheck still passes**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/kv-driver-redis/src/index.ts
git commit -m "feat(kv-driver-redis): finalize public exports"
```

---

## Verification Checklist (run before declaring done)

- [ ] Redis instance reachable at `REDIS_URL` (or `redis://localhost:6379`)
- [ ] `pnpm --filter @zeltjs/kv-driver-redis test` — all suites pass (config + compliance + ttl)
- [ ] `pnpm --filter @zeltjs/kv-driver-redis build` — produces `dist/index.{js,d.ts}`
- [ ] `pnpm --filter @zeltjs/kv-driver-redis typecheck` — clean
- [ ] `pnpm typecheck` — root project clean
- [ ] `pnpm lint` — clean
- [ ] `RedisKV` passes the `@zeltjs/kv/testing` compliance suite end-to-end
- [ ] Each task = its own commit
