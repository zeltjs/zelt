---
---

# Key-Valueストア

Zeltは、TTLサポートとatomic操作を備えたnamespaceベースのkey-valueストレージとして `@zeltjs/kv` を提供します。

## 概要 {#overview}

KVモジュールは以下を提供します:

- **`KVAdaptor` / `AtomicKVAdaptor`** — namespace化されたストアを作成するトップレベルのadaptor
- **`KVStore` / `AtomicKVStore`** — データ操作(get、set、delなど)のためのインターフェース
- **`MemoryKV`** — 自動ガベージコレクションを備えたインメモリ実装
- **Promiseベースのapi** — すべての操作は `Promise` を返し、エラー時にthrowする

## インストール {#installation}

```bash
pnpm add @zeltjs/kv
```

## 基本的な使い方 {#basic-usage}

`MemoryKV` をinjectして、namespace化されたストアを作成します:

```typescript
import { Injectable, inject } from '@zeltjs/core';
import { MemoryKV, type AtomicKVStore } from '@zeltjs/kv';

interface User { id: string; name: string; }
// ---cut---
@Injectable()
export class CacheService {
  private store: AtomicKVStore;

  constructor(private kv = inject(MemoryKV)) {
    this.store = this.kv.namespace('cache');
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.store.get<User>(`user:${id}`);
  }

  async setUser(id: string, user: User): Promise<void> {
    await this.store.set(`user:${id}`, user, { ttlSec: 3600 });
  }
}
```

## KVStoreのメソッド {#kvstore-methods}

| メソッド | 説明 |
|--------|-------------|
| `get<T>(key)` | キーで値を取得する |
| `set<T>(key, value, opts?)` | 値をオプションのTTL付きで保存する |
| `del(key)` | キーを削除する |
| `has(key)` | キーが存在するか確認する |
| `expire(key, ttlSec)` | 既存のキーのTTLを更新する |
| `namespace(prefix)` | 子namespaceを作成する |

### TTL(Time-To-Live) {#ttl-time-to-live}

```typescript
import { inject } from '@zeltjs/core';
import { MemoryKV } from '@zeltjs/kv';

const store = inject(MemoryKV).namespace('sessions');
// ---cut---
await store.set('session:abc', { userId: '123' }, { ttlSec: 1800 });

// 既存キーのTTLを延長する(セッションのtouchに便利)
await store.expire('session:abc', 1800);
```

## Atomic操作 {#atomic-operations}

`AtomicKVStore` は `KVStore` を拡張し、atomic操作を追加します:

| メソッド | 説明 |
|--------|-------------|
| `incr(key, by?, opts?)` | atomicなインクリメント(キーがなければ作成する) |
| `setnx<T>(key, value, opts?)` | キーが存在しない場合のみ設定する |

### incrによるレート制限 {#rate-limiting-with-incr}

```typescript
import { Injectable, inject } from '@zeltjs/core';
import { MemoryKV, type AtomicKVStore } from '@zeltjs/kv';
// ---cut---
@Injectable()
export class RateLimiter {
  private store: AtomicKVStore;

  constructor(kv = inject(MemoryKV)) {
    this.store = kv.namespace('ratelimit');
  }

  async checkLimit(clientId: string, limit: number): Promise<boolean> {
    const count = await this.store.incr(`req:${clientId}`, 1, { ttlSec: 60 });
    return count <= limit;
  }
}
```

### setnxによる分散ロック {#distributed-locks-with-setnx}

```typescript
import { inject } from '@zeltjs/core';
import { MemoryKV } from '@zeltjs/kv';

const store = inject(MemoryKV).namespace('locks');
// ---cut---
const acquired = await store.setnx('lock:resource', true, { ttlSec: 30 });
if (acquired) {
  // ロックを取得したら作業を行い、その後解放する
  await store.del('lock:resource');
}
```

## Namespace {#namespacing}

Namespaceはキーの論理的な分離を提供します。ネストさせることもできます:

```typescript
import { inject } from '@zeltjs/core';
import { MemoryKV } from '@zeltjs/kv';

const kv = inject(MemoryKV);
// ---cut---
const users = kv.namespace('users');
const sessions = kv.namespace('sessions');

const adminSessions = sessions.namespace('admin');
```

## エラーハンドリング {#error-handling}

KV操作は失敗時にエラーをthrowします。エラーハンドリングにはtry-catchを使ってください:

```typescript
import { inject } from '@zeltjs/core';
import { MemoryKV } from '@zeltjs/kv';

const store = inject(MemoryKV).namespace('data');
const value = { data: 'test' };
// ---cut---
try {
  await store.set('key', value, { ttlSec: -1 });
  console.log('Success');
} catch (error) {
  console.error((error as Error).message);
}
```

エラー種別: `INVALID_TTL`、`EMPTY_NAMESPACE`、`INVALID_VALUE`、`STORE_OPERATION_FAILED`。

## MemoryKV {#memorykv}

`MemoryKV` は開発・テスト向けのインメモリ実装です。値をJSONにシリアライズし、60秒ごとにガベージコレクションを実行します。

```typescript
import { createApp, Controller, Get, http } from '@zeltjs/core';
import { MemoryKV } from '@zeltjs/kv';

@Controller('/') class AppController { @Get('/') index() { return { ok: true }; } }
// ---cut---
const app = createApp([http({
    controllers: [AppController],
  })]);
```
