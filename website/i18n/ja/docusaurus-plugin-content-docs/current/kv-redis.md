---
---

# Redis KVドライバ

`@zeltjs/kv` は `@zeltjs/kv/adaptor-redis` エントリポイント経由でRedisバックエンドを提供します。`RedisKVAdaptor` は [ioredis](https://github.com/redis/ioredis) の上に `AtomicKVAdaptor` を実装し、`incr` や `setnx` などのatomic操作をサポートします。

## インストール {#installation}

```bash
pnpm add @zeltjs/kv @zeltjs/redis
```

Peer dependency:

```bash
pnpm add @zeltjs/core
```

## 基本的なセットアップ {#basic-setup}

`RedisKVAdaptor` をinjectして、namespace化されたストアを作成します。`namespace()` は `AtomicKVStore` を直接返し、`get()` は値(キーが存在しない場合は `undefined`)に解決されます — unwrapが必要なresultラッパーはありません:

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

アプリ作成時に `RedisConfig` と `RedisKVAdaptor` を登録します。`RedisConfig` が接続設定を提供し(`RedisKVAdaptor` が依存する `RedisService` がそれを利用します)、依存関係は自動的に解決されるので、`injectables` に `RedisKVAdaptor` を挙げるだけで十分です:

```typescript twoslash
import { createApp, Controller, Get, http } from '@zeltjs/core';
import { RedisKVAdaptor } from '@zeltjs/kv/adaptor-redis';
import { RedisConfig } from '@zeltjs/redis';

@Controller('/app')
class AppController { @Get('/') get() { return {}; } }
// ---cut---
const app = createApp([http({
    controllers: [AppController],
  })], { configs: [RedisConfig] });
```

デフォルトでは、`RedisConfig` は接続URLを環境変数 `REDIS_URL` から読み取り、未設定時は `redis://localhost:6379` にフォールバックします。

## カスタム設定 {#custom-configuration}

`RedisConfig` を継承して接続設定をカスタマイズします。`options` getterはioredisの `RedisOptions` を返します:

```typescript twoslash
import { Config } from '@zeltjs/core';
import { RedisConfig } from '@zeltjs/redis';
// ---cut---
@Config
class CustomRedisConfig extends RedisConfig {
  override get url(): string {
    return this.env.getString('REDIS_URL', 'redis://localhost:6379');
  }

  override get options() {
    return {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
    };
  }
}
```

デフォルトの代わりにカスタムconfigを登録します:

```typescript twoslash
import { createApp, Config, Controller, Get, http } from '@zeltjs/core';
import { RedisConfig } from '@zeltjs/redis';
import { RedisKVAdaptor } from '@zeltjs/kv/adaptor-redis';

@Config
class CustomRedisConfig extends RedisConfig {
  override get url(): string { return this.env.getString('REDIS_URL', 'redis://localhost:6379'); }
  override get options() { return { maxRetriesPerRequest: 3 }; }
}
@Controller('/app')
class AppController { @Get('/') get() { return {}; } }
// ---cut---
const app = createApp([http({
    controllers: [AppController],
  })], { configs: [CustomRedisConfig] });
```

## APIリファレンス {#api-reference}

### RedisKVAdaptor {#rediskvadaptor}

| メソッド | 説明 |
|--------|-------------|
| `namespace(prefix)` | namespace化された `AtomicKVStore` を返す |

`RedisKVAdaptor` はアプリケーションのライフサイクルに参加します。基盤となるioredis接続は `RedisService` が保持しており、シャットダウン時に自動的に切断されます([グレースフルシャットダウン](#graceful-shutdown)を参照)。

### AtomicKVStoreのメソッド {#atomickvstore-methods}

| メソッド | 説明 |
|--------|-------------|
| `get<T>(key)` | 値を取得する。存在しない場合は `undefined` |
| `set<T>(key, value, opts?)` | 値をオプションのTTL付きで保存する |
| `del(key)` | キーを削除する |
| `has(key)` | キーが存在するか確認する |
| `expire(key, ttlSec)` | 既存のキーのTTLを更新する |
| `incr(key, by?, opts?)` | atomicなインクリメント |
| `setnx<T>(key, value, opts?)` | 存在しない場合のみsetする |
| `namespace(prefix)` | ネストしたnamespaceを作成する |

## 本番環境のセットアップ {#production-setup}

本番デプロイでは、接続プーリングとリトライ動作を設定します:

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

### グレースフルシャットダウン {#graceful-shutdown}

Redisを手動で切断する必要はありません。`RedisService` がライフサイクルマネージャに自身を登録するため、アプリケーションのシャットダウン時にioredisクライアントが自動的に切断されます。

`@zeltjs/adapter-node` を使う場合、`onNode` がこのシャットダウンをトリガーする `SIGINT`/`SIGTERM` ハンドラをインストールし、`handle.shutdown()` も同じことを行います:

```typescript twoslash
import { createApp, Controller, Get, http } from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';
import { RedisKVAdaptor } from '@zeltjs/kv/adaptor-redis';
import { RedisConfig } from '@zeltjs/redis';

@Controller('/app') class AppController { @Get('/') get() { return {}; } }

const app = createApp([http({ controllers: [AppController] })], { configs: [RedisConfig] });
const nodeApp = await onNode(app);
// ---cut---
const handle = await nodeApp.http.listen({ port: 3000 });

// サーバーを切断し、ライフサイクルのシャットダウン(Redisを含む)を実行する
await handle.shutdown();
```
