---
---

# Redis KV Driver

`@zeltjs/kv` は `@zeltjs/kv/adaptor-redis` エントリポイント経由で Redis バックエンドを提供します。`RedisKVAdaptor` は [ioredis](https://github.com/redis/ioredis) を用いて `AtomicKVAdaptor` を実装し、`incr` や `setnx` などのアトミック操作をサポートします。

## インストール

```bash
pnpm add @zeltjs/kv @zeltjs/redis
```

peer dependency:

```bash
pnpm add @zeltjs/core
```

## 基本的なセットアップ

`RedisKVAdaptor` を inject し、namespace 化したストアを作成します。`namespace()` は `AtomicKVStore` をそのまま返し、`get()` は値（キーが存在しない場合は `undefined`）に解決されます。unwrap が必要な result ラッパーはありません:

```typescript twoslash
import { Injectable, inject } from '@zeltjs/core';
import { RedisKVAdaptor } from '@zeltjs/kv/adaptor-redis';
import type { AtomicKVStore, Defined } from '@zeltjs/kv';
// ---cut---
@Injectable()
export class CacheService {
  private store: AtomicKVStore;

  constructor(kv = inject(RedisKVAdaptor)) {
    this.store = kv.namespace('cache:');
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get<T>(key);
  }

  async set<T extends Defined>(key: string, value: T, ttlSec?: number): Promise<void> {
    await this.store.set(key, value, { ttlSec });
  }
}
```

アプリ生成時に `RedisConfig` と `RedisKVAdaptor` を登録します。`RedisConfig` が接続設定を提供し（`RedisKVAdaptor` が依存する `RedisService` が利用します）、依存は自動的に解決されるため、`injectables` には `RedisKVAdaptor` を挙げるだけで十分です:

```typescript twoslash
import { createApp, Controller, Get } from '@zeltjs/core';
import { RedisKVAdaptor } from '@zeltjs/kv/adaptor-redis';
import { RedisConfig } from '@zeltjs/redis';

@Controller('/app')
class AppController { @Get('/') get() { return {}; } }
// ---cut---
const app = createApp({
  http: {
    controllers: [AppController],
  },
  configs: [RedisConfig],
  injectables: [RedisKVAdaptor],
});
```

デフォルトでは、`RedisConfig` は接続 URL を環境変数 `REDIS_URL` から読み取り、未設定時は `redis://localhost:6379` にフォールバックします。

## カスタム設定

`RedisConfig` を継承して接続設定をカスタマイズできます。`options` getter は ioredis の `RedisOptions` を返します:

```typescript twoslash
import { Config, EnvService, inject } from '@zeltjs/core';
import { RedisConfig } from '@zeltjs/redis';
// ---cut---
@Config
class CustomRedisConfig extends RedisConfig {
  constructor(private envService = inject(EnvService)) {
    super();
  }

  override get url(): string {
    return this.envService.getString('REDIS_URL', 'redis://localhost:6379');
  }

  override get options() {
    return {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
    };
  }
}
```

デフォルトの代わりにカスタム config を登録します:

```typescript twoslash
import { createApp, Config, EnvService, inject, Controller, Get } from '@zeltjs/core';
import { RedisConfig } from '@zeltjs/redis';
import { RedisKVAdaptor } from '@zeltjs/kv/adaptor-redis';

@Config
class CustomRedisConfig extends RedisConfig {
  constructor(private envService = inject(EnvService)) { super(); }
  override get url(): string { return this.envService.getString('REDIS_URL', 'redis://localhost:6379'); }
  override get options() { return { maxRetriesPerRequest: 3 }; }
}
@Controller('/app')
class AppController { @Get('/') get() { return {}; } }
// ---cut---
const app = createApp({
  http: {
    controllers: [AppController],
  },
  configs: [CustomRedisConfig],
  injectables: [RedisKVAdaptor],
});
```

## API リファレンス

### RedisKVAdaptor

| メソッド | 説明 |
|--------|-------------|
| `namespace(prefix)` | namespace 化された `AtomicKVStore` を返す |

`RedisKVAdaptor` はアプリケーションのライフサイクルに参加します。ioredis の接続は `RedisService` が保持し、シャットダウン時に自動的に切断されます（[グレースフルシャットダウン](#グレースフルシャットダウン)を参照）。

### AtomicKVStore のメソッド

| メソッド | 説明 |
|--------|-------------|
| `get<T>(key)` | 値を取得（存在しない場合は `undefined`） |
| `set<T>(key, value, opts?)` | TTL 任意指定で値を保存 |
| `del(key)` | キーを削除 |
| `has(key)` | キーの存在確認 |
| `expire(key, ttlSec)` | 既存キーの TTL を更新 |
| `incr(key, by?, opts?)` | アトミックなインクリメント |
| `setnx<T>(key, value, opts?)` | 存在しない場合のみ set |
| `namespace(prefix)` | ネストした namespace を作成 |

## 本番環境のセットアップ

本番デプロイでは、接続プールとリトライ動作を設定します:

```typescript twoslash
import { Config } from '@zeltjs/core';
import { RedisConfig } from '@zeltjs/redis';
// ---cut---
@Config
class ProductionRedisConfig extends RedisConfig {
  override get options() {
    return {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times: number) => {
        if (times > 10) return null;
        return Math.min(times * 200, 5000);
      },
    };
  }
}
```

### グレースフルシャットダウン

Redis を手動で切断する必要はありません。`RedisService` がライフサイクルマネージャに自身を登録するため、アプリケーションのシャットダウン時に ioredis クライアントが自動的に切断されます。

`@zeltjs/adapter-node` を使う場合、`onNode` が `SIGINT`/`SIGTERM` ハンドラを登録してこのシャットダウンをトリガーします。`handle.shutdown()` でも同様です:

```typescript twoslash
import { createApp, Controller, Get } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';
import { RedisKVAdaptor } from '@zeltjs/kv/adaptor-redis';
import { RedisConfig } from '@zeltjs/redis';

@Controller('/app') class AppController { @Get('/') get() { return {}; } }

const app = createApp({
  http: { controllers: [AppController] },
  configs: [RedisConfig],
  injectables: [RedisKVAdaptor],
});
const nodeApp = await onNode(app);
// ---cut---
const handle = await nodeApp.listen({ port: 3000 });

// サーバを停止し、ライフサイクルのシャットダウン（Redis を含む）を実行
await handle.shutdown();
```
