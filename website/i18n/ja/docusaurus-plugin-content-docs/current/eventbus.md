---
---

# イベントバス

`@zeltjs/eventbus` パッケージは、メモリおよびRedisアダプターを備えた型安全なイベントバスをpub/subメッセージング用に提供します。

## インストール {#installation}

```bash
pnpm add @zeltjs/eventbus
```

Redisサポートの場合:

```bash
pnpm add @zeltjs/eventbus @zeltjs/redis ioredis
```

## 概要 {#overview}

イベントバスは、publish/subscribeメッセージングを通じてコンポーネント間の疎結合な通信を可能にします。イベントはTypeScriptの宣言マージを通じて完全に型付けされます。

## イベントの定義 {#defining-events}

`EventBusSchema` インターフェースを拡張してイベントを定義します:

```typescript
// @noErrors
declare module '@zeltjs/eventbus' {
  interface EventBusSchema {
    'user.created': { userId: string; email: string };
    'order.placed': { orderId: string; total: number };
    'notification.send': { to: string; message: string };
  }
}
```

これにより、イベント名とペイロードの完全な型安全性が提供されます。

## メモリアダプター {#memory-adapter}

単一プロセスアプリケーションには、インメモリアダプターを使用します:

```typescript
// @noErrors
import { Injectable, inject } from '@zeltjs/core';
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus/adaptor-memory';

@Injectable()
export class NotificationService {
  constructor(private eventBus = inject(MemoryEventBusAdaptor)) {}

  async setup() {
    this.eventBus.on('user.created', (data) => {
      console.log(`Welcome email sent to ${data.email}`);
    });
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

## Redisアダプター {#redis-adapter}

分散アプリケーションには、Redisアダプターを使用します:

```typescript
// @noErrors
import { Injectable, inject } from '@zeltjs/core';
import { RedisEventBusAdaptor } from '@zeltjs/eventbus/adaptor-redis';

@Injectable()
export class OrderService {
  constructor(private eventBus = inject(RedisEventBusAdaptor)) {}

  async placeOrder(items: OrderItem[]) {
    const orderId = crypto.randomUUID();
    const total = items.reduce((sum, item) => sum + item.price, 0);

    await this.eventBus.emit('order.placed', { orderId, total });
    return { orderId };
  }
}
```

Redisアダプターには `@zeltjs/redis` の設定が必要です:

```typescript
// @noErrors
import { createApp, http } from '@zeltjs/core';
import { RedisConfig } from '@zeltjs/redis';

const app = createApp([http({
    controllers: [OrderController],
  })], { configs: [RedisConfig] });
```

## APIリファレンス {#api-reference}

### EventBusAdaptorインターフェース {#eventbusadaptor-interface}

両方のアダプターがこのインターフェースを実装しています:

| メソッド | 説明 |
|--------|------|
| `emit(event, data)` | ペイロード付きでイベントを発行 |
| `on(event, handler)` | イベントを購読。購読解除関数を返す |
| `once(event, handler)` | イベントを一度だけ購読。購読解除関数を返す |

### MemoryEventBusAdaptor {#memoryeventbusadaptor}

Node.js EventEmitterを使用したインメモリイベントバス。イベントはプロセス内でローカルです。

```typescript
// @noErrors
import { MemoryEventBusAdaptor } from '@zeltjs/eventbus/adaptor-memory';
```

### RedisEventBusAdaptor {#rediseventbusadaptor}

pub/subを使用したRedisバックエンドのイベントバス。イベントはプロセス間で分散されます。

```typescript
// @noErrors
import { RedisEventBusAdaptor } from '@zeltjs/eventbus/adaptor-redis';
```

## 購読解除 {#unsubscribing}

`on()` と `once()` の両方が購読解除関数を返します:

```typescript
// @noErrors
const unsubscribe = eventBus.on('user.created', (data) => {
  console.log(data.email);
});

// 後で購読を停止する
unsubscribe();
```

## ベストプラクティス {#best-practices}

### イベント命名 {#event-naming}

イベント名にはドット記法を使用します: `domain.action`

```typescript
// @noErrors
interface EventBusSchema {
  'user.created': { userId: string };
  'user.updated': { userId: string; changes: string[] };
  'user.deleted': { userId: string };
  'order.placed': { orderId: string };
  'order.shipped': { orderId: string; trackingNumber: string };
}
```

### べき等なハンドラー {#idempotent-handlers}

イベントハンドラーはべき等に設計します — 同じデータで複数回実行しても安全:

```typescript
// @noErrors
eventBus.on('order.placed', async (data) => {
  const existing = await db.query.notifications.findFirst({
    where: eq(notifications.orderId, data.orderId),
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

```typescript
// @noErrors
eventBus.on('user.created', async (data) => {
  try {
    await sendWelcomeEmail(data.email);
  } catch (error) {
    console.error('Failed to send welcome email:', error);
  }
});
```
