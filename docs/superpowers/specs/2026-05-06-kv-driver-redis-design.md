# @zeltjs/kv-driver-redis Design Spec

## Overview

Node.js 環境向け Redis driver。`@zeltjs/kv` の `AtomicKVDriver` を実装する。`ioredis` を使用し、`incr + ttl`、`setnx + ttl`、`delIf` を Lua スクリプトで単一 round-trip の atomic 操作として保証する。

## Goals

- `ioredis` ベースの Redis driver 実装
- atomic 操作を Lua で実装し race condition を排除
- `RedisConfig` で URL・接続オプションを user が override 可能（default は `REDIS_URL` 環境変数）
- `Disposable` 実装で graceful shutdown
- `@zeltjs/kv/testing` のコンプライアンステスト全通過

## Non-Goals

- Edge runtime 対応（Cloudflare Workers から TCP 接続不可、Upstash 用に別パッケージ `@zeltjs/kv-driver-upstash`）
- Sentinel / Cluster の高可用構成（v1 では single-node のみ）
- Pub/Sub 機能（`@zeltjs/pubsub` で別途）
- Streams / Sorted Set 等の Redis 固有データ構造（`AtomicKVStore` の範囲外）

## Package Structure

```
packages/kv-driver-redis/
├── src/
│   ├── index.ts
│   ├── redis.config.ts     ← @Config RedisConfig (URL / options)
│   ├── redis-kv.ts         ← @Injectable RedisKV (AtomicKVDriver 実装)
│   ├── redis-kv-store.ts   ← AtomicKVStore 実装 (namespace 後の view)
│   └── lua-scripts.ts      ← incr-with-ttl / setnx-with-ttl / del-if スクリプト
├── test/
│   └── compliance.test.ts  ← @zeltjs/kv/testing の suite を実行
├── package.json
└── tsconfig.json
```

## Dependencies

- `ioredis@5.x.y` — Redis クライアント
- `@zeltjs/core` — peerDependency (`@Config`, `@Injectable`, `injectConfig`, `Disposable`)
- `@zeltjs/kv` — peerDependency (`AtomicKVDriver`, `AtomicKVStore`, errors, helpers)

## API Design

### RedisConfig

```typescript
import { Config } from '@zeltjs/core';
import type { RedisOptions } from 'ioredis';

@Config
export class RedisConfig {
  static readonly Token = RedisConfig;

  /** 接続 URL。default は REDIS_URL 環境変数 */
  get url(): string {
    return process.env.REDIS_URL ?? 'redis://localhost:6379';
  }

  /** ioredis オプションの override 用 */
  get options(): RedisOptions {
    return {};
  }
}
```

User extends で env 変数名や options をカスタマイズ:

```typescript
@Config
export class AppRedisConfig extends RedisConfig {
  override get url() {
    return process.env.MY_REDIS_URL ?? super.url;
  }

  override get options(): RedisOptions {
    return { maxRetriesPerRequest: 3 };
  }
}
```

### RedisKV

```typescript
import { Injectable, injectConfig, type Disposable } from '@zeltjs/core';
import type { AtomicKVDriver, AtomicKVStore } from '@zeltjs/kv';
import Redis from 'ioredis';

@Injectable()
export class RedisKV implements AtomicKVDriver, Disposable {
  private readonly client: Redis;

  constructor(config = injectConfig(RedisConfig)) {
    this.client = new Redis(config.url, config.options);
    this.registerLuaScripts();
  }

  namespace(prefix: string): AtomicKVStore {
    return new RedisKVStore(this.client, prefix);
  }

  private registerLuaScripts() {
    // ioredis の defineCommand で Lua をプリコンパイル
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

  dispose() {
    this.client.disconnect();
  }
}
```

### RedisKVStore (namespaced view)

```typescript
class RedisKVStore implements AtomicKVStore {
  constructor(
    private readonly client: Redis,
    private readonly prefix: string,
  ) {
    if (prefix.length === 0) throw new MinPrefixLengthError();
  }

  private k(key: string): string {
    return this.prefix + key;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(this.k(key));
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T, opts?: { ttlSec?: number }): Promise<void> {
    if (value === undefined) throw new KVError('Cannot set undefined');
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
    if (sub.length === 0) throw new MinPrefixLengthError();
    return new RedisKVStore(this.client, this.prefix + sub);
  }

  async incr(key: string, by = 1, opts?: { ttlSec?: number }): Promise<number> {
    return await (this.client as any).zeltIncrWithTtl(
      this.k(key),
      by,
      opts?.ttlSec ?? '',
    );
  }

  async setnx<T>(key: string, value: T, opts?: { ttlSec?: number }): Promise<boolean> {
    const json = JSON.stringify(value);
    const result = await (this.client as any).zeltSetnxWithTtl(
      this.k(key),
      json,
      opts?.ttlSec ?? '',
    );
    return result === 1;
  }

  async delIf(key: string, expected: unknown): Promise<boolean> {
    const json = JSON.stringify(expected);
    const result = await (this.client as any).zeltDelIf(this.k(key), json);
    return result === 1;
  }
}
```

### Lua Scripts

```typescript
// 最初の incr 時のみ EXPIRE を発行 (TTL 延長を防ぐ)
export const INCR_WITH_TTL_LUA = `
  local v = redis.call('INCRBY', KEYS[1], ARGV[1])
  if v == tonumber(ARGV[1]) and ARGV[2] ~= '' then
    redis.call('EXPIRE', KEYS[1], ARGV[2])
  end
  return v
`;

// SET NX EX を 1 コマンドで (NX と EX を別 SET で発行する race を回避)
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

// 値が一致したときのみ削除 (lock release で他人の lock を消さない)
export const DEL_IF_LUA = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;
```

## Exports

```typescript
export { RedisConfig } from './redis.config';
export { RedisKV } from './redis-kv';
```

## package.json

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
    "ioredis": "5.x.y"
  },
  "devDependencies": {
    "@zeltjs/core": "workspace:*",
    "@zeltjs/kv": "workspace:*",
    "@types/node": "22.19.17"
  }
}
```

## Usage Example

### Basic Setup

```typescript
// src/configs/cache.config.ts
import { Config, inject } from '@zeltjs/core';
import { RedisKV } from '@zeltjs/kv-driver-redis';
import type { AtomicKVStore } from '@zeltjs/kv';

@Config
export class CacheConfig {
  static readonly Token = CacheConfig;

  constructor(kv = inject(RedisKV)) {
    this.store = kv.namespace('cache:');
  }

  readonly store: AtomicKVStore;
  defaultTtlSec = 300;
}
```

### Custom RedisConfig

```typescript
// src/configs/redis.config.ts
import { Config } from '@zeltjs/core';
import { RedisConfig } from '@zeltjs/kv-driver-redis';
import type { RedisOptions } from 'ioredis';

@Config
export class AppRedisConfig extends RedisConfig {
  override get url(): string {
    return process.env.APP_REDIS_URL ?? super.url;
  }

  override get options(): RedisOptions {
    return {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
    };
  }
}
```

### 共有 Redis を複数 use-case で利用

```typescript
// cache.config.ts
@Config
export class CacheConfig {
  static readonly Token = CacheConfig;
  constructor(kv = inject(RedisKV)) {
    this.store = kv.namespace('cache:');  // → cache:* 名前空間
  }
  readonly store: AtomicKVStore;
}

// rate-limit.config.ts
@Config
export class RateLimitConfig {
  static readonly Token = RateLimitConfig;
  constructor(kv = inject(RedisKV)) {
    this.store = kv.namespace('rate-limit:');  // → rate-limit:* 名前空間
  }
  readonly store: AtomicKVStore;
}
```

`RedisKV` は `@Injectable()` で auto-bind → DI コンテナ内で singleton として共有される。Redis 接続は 1 つで、namespace prefix で論理分離。

## Error Handling

| Scenario | Behavior |
|---|---|
| 接続失敗 | `ioredis` の error を伝播 |
| コマンド失敗 | `ioredis` の error を `KVError` で wrap して throw |
| TTL = 0 / 負数 | `MinTtlError` |
| `set(key, undefined)` | `KVError` |
| `dispose()` 後の操作 | `ioredis` 側でエラー |

## Testing Strategy

- `runAtomicKVStoreComplianceTests(() => new RedisKV(testConfig))` を実行
- `testcontainers-node` (or docker compose service) で Redis を起動
- Lua スクリプトの atomic 性検証
  - `incr` を 100 並列で発火 → 最終値が 100
  - `setnx` を 10 並列で発火 → 1 つだけ true、他は false
  - `delIf` の値ミスマッチで削除されない
- `dispose()` 後の接続クローズ確認
- TTL 延長（`incr` 第 2 回以降は EXPIRE が呼ばれない）の確認

## Future Considerations

- ioredis Cluster / Sentinel 対応（`RedisConfig` に mode 切替を追加）
- Connection pool / pipelining 設定の Config 公開
- 再接続戦略のカスタマイズ
- `KEYS` / `SCAN` コマンド対応 — v2 で議論（dangerous なので慎重に）
- `cas` (compare-and-swap) — `WATCH`/`MULTI`/`EXEC` で実装可能
- メトリクス出力（コマンド latency, 失敗率）
