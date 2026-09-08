---
---

# イベントバス

`@zeltjs/eventbus` パッケージは、メモリおよびRedisアダプターを備えた型安全なイベントバスをpub/subメッセージング用に提供します。

## インストール {#installation}

```bash
pnpm add @zeltjs/eventbus @zeltjs/core
```

Redisサポートの場合:

```bash
pnpm add @zeltjs/eventbus @zeltjs/core @zeltjs/redis
```

## 概要 {#overview}

イベントバスは、publish/subscribeメッセージングを通じてコンポーネント間の疎結合な通信を可能にします。イベントはTypeScriptの宣言マージを通じて完全に型付けされます。

## イベントの定義 {#defining-events}

`EventBusSchema` インターフェースを拡張してイベントを定義します:

```typescript twoslash
import type { EventBusSchema } from '@zeltjs/eventbus';
// ---cut---
declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'user.created': { userId: string; email: string };
    'order.placed': { orderId: string; total: number };
    'notification.send': { to: string; message: string };
  }
}
```

これにより、イベント名とペイロードの完全な型安全性が提供されます。

## アプリへの登録 {#app-setup}

`createApp` に `eventbus` フィーチャーを登録します。`adaptor`（発行・購読に使うアダプタークラス）と、任意の `handlers`（購読者クラスの配列）を受け取ります：

```typescript twoslash
import { Injectable, inject, LifecycleManager, createApp, http } from '@zeltjs/core';
import type { Lifecycle } from '@zeltjs/core';
import { MemoryEventBusAdaptor, eventbus } from '@zeltjs/eventbus';

declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'user.created': { userId: string; email: string };
  }
}

@Injectable()
class NotificationHandlers implements Lifecycle {
  private unsubscribes: Array<() => void> = [];

  constructor(
    private readonly eventBus = inject(MemoryEventBusAdaptor),
    lifecycle = inject(LifecycleManager),
  ) {
    lifecycle.register(this);
  }

  async startup(): Promise<void> {
    const unsub = this.eventBus.on('user.created', (data) => {
      console.log(`Welcome email sent to ${data.email}`);
    });
    this.unsubscribes.push(unsub);
  }

  async shutdown(): Promise<void> {
    for (const unsub of this.unsubscribes) unsub();
    this.unsubscribes = [];
  }
}
// ---cut---
const app = createApp([
  http({ controllers: [] }),
  eventbus({ adaptor: MemoryEventBusAdaptor, handlers: [NotificationHandlers] }),
]);
```

`adaptor` は、購読者がそのアダプターを直接注入して使う `emit`/`on`/`once` の実体となる `EventBusAdaptor` の実装を選びます。`handlers` は、アプリの他のどこからも依存されていない購読者クラスを列挙するためのものです。ここに列挙しなければ、そのクラスは構築されず、`startup()` 内の購読処理も一切実行されません。

## Lifecycle による購読 {#subscribing-with-lifecycle}

購読者クラスは `@zeltjs/core` の `Lifecycle` を実装します。`startup()` で購読を開始し、返された購読解除関数を保持しておき、`shutdown()` で呼び出します。

```typescript twoslash
declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'user.created': { userId: string; email: string };
  }
}

import { Injectable, inject, LifecycleManager } from '@zeltjs/core';
import type { Lifecycle } from '@zeltjs/core';
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus';
// ---cut---
@Injectable()
export class NotificationHandlers implements Lifecycle {
  private unsubscribes: Array<() => void> = [];

  constructor(
    private readonly eventBus = inject(MemoryEventBusAdaptor),
    lifecycle = inject(LifecycleManager),
  ) {
    lifecycle.register(this);
  }

  async startup(): Promise<void> {
    const unsub = this.eventBus.on('user.created', (data) => {
      console.log(`Welcome email sent to ${data.email}`);
    });
    this.unsubscribes.push(unsub);
  }

  async shutdown(): Promise<void> {
    for (const unsub of this.unsubscribes) unsub();
    this.unsubscribes = [];
  }
}

@Injectable()
export class UserService {
  constructor(private eventBus = inject(MemoryEventBusAdaptor)) {}

  async createUser(email: string) {
    const userId = crypto.randomUUID();
    await this.eventBus.emit('user.created', { userId, email });
    return { userId };
  }
}
```

`UserService` は同じアダプタークラスを直接注入してイベントを発行します。`emit` を使うだけならフィーチャーによる事前構築は不要なので、発行側を `handlers` に列挙する必要はありません。

## メモリアダプター {#memory-adapter}

単一プロセスアプリケーションには、インメモリアダプターを使用します。`MemoryEventBusAdaptor` は [mitt](https://github.com/developit/mitt) 上に構築されており、イベントはプロセス内でローカルに扱われ、再起動すると失われます：

```typescript twoslash
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus/adaptor-memory';
```

## Redis アダプター {#redis-adapter}

分散アプリケーションには、Redis アダプターを使用します。`RedisEventBusAdaptor` はそれ自体が `Lifecycle` を実装しており、`startup()` で購読専用の接続を開き、`shutdown()` で切断します。

```typescript twoslash
import type { EventBusSchema } from '@zeltjs/eventbus';
import { Injectable, inject } from '@zeltjs/core';
import { RedisEventBusAdaptor } from '@zeltjs/eventbus/adaptor-redis';

declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'order.placed': { orderId: string; total: number };
  }
}
// ---cut---
@Injectable()
export class OrderService {
  constructor(private eventBus = inject(RedisEventBusAdaptor)) {}

  async placeOrder(items: { price: number }[]) {
    const orderId = crypto.randomUUID();
    const total = items.reduce((sum, item) => sum + item.price, 0);

    await this.eventBus.emit('order.placed', { orderId, total });
    return { orderId };
  }
}
```

Redis アダプターを使うには `@zeltjs/redis` の設定が必要です。`eventbus` フィーチャーと一緒に `RedisConfig` を登録します：

```typescript twoslash
import { createApp, http } from '@zeltjs/core';
import { eventbus } from '@zeltjs/eventbus';
import { RedisEventBusAdaptor } from '@zeltjs/eventbus/adaptor-redis';
import { RedisConfig } from '@zeltjs/redis';

declare class OrderHandlers {}
// ---cut---
const app = createApp(
  [
    http({ controllers: [] }),
    eventbus({ adaptor: RedisEventBusAdaptor, handlers: [OrderHandlers] }),
  ],
  { configs: [RedisConfig] },
);
```

`@zeltjs/redis` は `@zeltjs/eventbus` のオプションのピア依存関係です。`RedisEventBusAdaptor` を使う場合のみインストールしてください。接続 URL やリトライ戦略など `RedisConfig` のカスタマイズについては [Redis KV ドライバー](./kv-redis.md) を参照してください。

## API リファレンス {#api-reference}

### eventbus(options) {#eventbusoptions}

イベントバスフィーチャーを登録します。アプリに `eventbus` キーとして追加されます。

| オプション | 説明 |
|--------|--------------|
| `adaptor` | 構築して公開する `EventBusAdaptor` クラス（`MemoryEventBusAdaptor` または `RedisEventBusAdaptor`） |
| `handlers` | 起動時に強制的に構築する購読者クラス。これにより `Lifecycle.startup()` の購読処理が実行される |

### EventBusAdaptor インターフェース {#eventbusadaptor-interface}

両方のアダプターがこのインターフェースを実装しています:

| メソッド | 説明 |
|--------|------|
| `emit(event, data)` | ペイロード付きでイベントを発行 |
| `on(event, handler)` | イベントを購読。購読解除関数を返す |
| `once(event, handler)` | イベントを一度だけ購読。購読解除関数を返す |

### MemoryEventBusAdaptor {#memoryeventbusadaptor}

[mitt](https://github.com/developit/mitt) 上に構築されたインメモリイベントバス。イベントはプロセス内でローカルです。

```typescript twoslash
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus/adaptor-memory';
```

### RedisEventBusAdaptor {#rediseventbusadaptor}

pub/subを使用したRedisバックエンドのイベントバス。イベントはプロセス間で分散されます。

```typescript twoslash
import { RedisEventBusAdaptor } from '@zeltjs/eventbus/adaptor-redis';
```

## 購読解除 {#unsubscribing}

`on()` と `once()` の両方が購読解除関数を返します:

```typescript twoslash
import type { EventBusSchema } from '@zeltjs/eventbus';
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus/adaptor-memory';

declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'user.created': { userId: string; email: string };
  }
}

const eventBus = new MemoryEventBusAdaptor();
// ---cut---
const unsubscribe = eventBus.on('user.created', (data) => {
  console.log(data.email);
});

// Later, stop listening
unsubscribe();
```

## ベストプラクティス {#best-practices}

### イベント命名 {#event-naming}

イベント名にはドット記法を使用します: `domain.action`

```typescript twoslash
import type { EventBusSchema } from '@zeltjs/eventbus';
// ---cut---
declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'user.created': { userId: string };
    'user.updated': { userId: string; changes: string[] };
    'user.deleted': { userId: string };
    'order.placed': { orderId: string };
    'order.shipped': { orderId: string; trackingNumber: string };
  }
}
```

### べき等なハンドラー {#idempotent-handlers}

イベントハンドラーはべき等に設計します — 同じデータで複数回実行しても安全:

```typescript twoslash
import type { EventBusSchema } from '@zeltjs/eventbus';
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus/adaptor-memory';

declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'order.placed': { orderId: string; total: number };
  }
}

declare const db: {
  query: {
    notifications: { findFirst: (opts: unknown) => Promise<{ orderId: string } | undefined> };
  };
  insert: (table: unknown) => { values: (data: unknown) => Promise<void> };
};
declare const notifications: unknown;
declare const eq: (column: unknown, value: unknown) => unknown;

const eventBus = new MemoryEventBusAdaptor();
// ---cut---
eventBus.on('order.placed', async (data) => {
  const existing = await db.query.notifications.findFirst({
    where: eq(notifications, data.orderId),
  });

  if (existing) return;

  await db.insert(notifications).values({
    orderId: data.orderId,
    type: 'order_confirmation',
  });
});
```

### エラーハンドリング {#error-handling}

エラーが他の購読者に影響を与えないように、ハンドラーをtry-catchでラップします:

```typescript twoslash
import type { EventBusSchema } from '@zeltjs/eventbus';
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus/adaptor-memory';

declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'user.created': { userId: string; email: string };
  }
}

declare const sendWelcomeEmail: (email: string) => Promise<void>;

const eventBus = new MemoryEventBusAdaptor();
// ---cut---
eventBus.on('user.created', async (data) => {
  try {
    await sendWelcomeEmail(data.email);
  } catch (error) {
    console.error('Failed to send welcome email:', error);
  }
});
```
