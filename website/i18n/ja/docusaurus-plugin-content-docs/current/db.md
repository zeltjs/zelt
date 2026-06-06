---
---

# データベース

`@zeltjs/db` パッケージは、AsyncLocalStorage を使用した自動トランザクション伝播を備えた ORM 非依存のデータベース抽象化を提供します。

## インストール

```bash
pnpm add @zeltjs/db
```

## 概要

Zelt のデータベース抽象化は、トランザクションオブジェクトを明示的に渡すことなくサービスレイヤー全体にトランザクションを伝播させるという一般的な問題を解決します。Node.js の AsyncLocalStorage を使用して、トランザクションは非同期呼び出しチェーンを通じて自動的に流れます。

## データベースサービスの作成

`DatabaseService` を拡張して ORM を統合します：

```typescript
// @noErrors
import { DatabaseService } from '@zeltjs/db';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export class DrizzleService extends DatabaseService<PostgresJsDatabase> {
  private sql!: postgres.Sql;

  async setup(): Promise<PostgresJsDatabase> {
    this.sql = postgres(process.env.DATABASE_URL!);
    const db = drizzle(this.sql);

    this.onShutdown(async () => {
      await this.sql.end();
    });

    return db;
  }

  transaction<T>(
    client: PostgresJsDatabase,
    fn: (tx: PostgresJsDatabase) => Promise<T>,
  ): Promise<T> {
    return client.transaction(fn);
  }
}
```

ポイント：

- `setup()` — データベースクライアントを初期化して返す
- `transaction()` — トランザクション内で関数を実行
- `onShutdown()` — グレースフルシャットダウン用のクリーンアップハンドラーを登録

## データベースサービスの使用

### 直接使用

サービスを注入してクライアントにアクセスします：

```typescript
// @noErrors
import { Injectable, inject } from '@zeltjs/core';
import { users } from './schema';
// ---cut---
@Injectable()
export class UserRepository {
  constructor(private db = inject(DrizzleService)) {}

  async findAll() {
    return this.db.client.select().from(users);
  }

  async create(name: string, email: string) {
    return this.db.client.insert(users).values({ name, email });
  }
}
```

`client` プロパティは自動的に以下を返します：
- トランザクション内の場合はトランザクションクライアント
- それ以外の場合は元のクライアント

### トランザクションデコレーター

データベースサービス用のデコレーターを作成します：

```typescript
// @noErrors
import { createTransactionDecorator } from '@zeltjs/db';

export const Transaction = createTransactionDecorator(DrizzleService);
```

トランザクション内で実行すべきメソッドに適用します：

```typescript
// @noErrors
import { Injectable, inject } from '@zeltjs/core';

@Injectable()
export class OrderService {
  constructor(
    private orderRepo = inject(OrderRepository),
    private inventoryRepo = inject(InventoryRepository),
  ) {}

  @Transaction()
  async placeOrder(userId: string, items: OrderItem[]) {
    const order = await this.orderRepo.create(userId, items);

    for (const item of items) {
      await this.inventoryRepo.decrement(item.productId, item.quantity);
    }

    return order;
  }
}
```

`placeOrder` 内のすべてのリポジトリ呼び出しは自動的に同じトランザクションを使用します。いずれかの操作が失敗すると、トランザクション全体がロールバックされます。

### トランザクションミドルウェア

リクエストスコープのトランザクションにはミドルウェアを使用します：

```typescript
// @noErrors
import { createTransactionMiddleware } from '@zeltjs/db';

export const TransactionMiddleware = createTransactionMiddleware(DrizzleService);
```

コントローラーに適用します：

```typescript
// @noErrors
import { Controller, Post, body, UseMiddleware } from '@zeltjs/core';

@Controller('/orders')
@UseMiddleware(TransactionMiddleware)
export class OrderController {
  constructor(private orderService = inject(OrderService)) {}

  @Post('/')
  async create(data = body<CreateOrderDto>()) {
    return this.orderService.placeOrder(data.userId, data.items);
  }
}
```

このコントローラーへのすべてのリクエストがトランザクション内で実行されます。

## トランザクション伝播

トランザクションは非同期呼び出しチェーンを通じて自動的に伝播します：

```typescript
// @noErrors
@Injectable()
export class PaymentService {
  @Transaction()
  async processPayment(orderId: string, amount: number) {
    await this.ledgerRepo.debit(orderId, amount);
    await this.notificationService.sendReceipt(orderId);
  }
}

@Injectable()
export class OrderService {
  @Transaction()
  async completeOrder(orderId: string) {
    await this.orderRepo.markComplete(orderId);
    await this.paymentService.processPayment(orderId, 100);
  }
}
```

`completeOrder` が `processPayment` を呼び出すと、両方が同じトランザクション内で実行されます — 内側の `@Transaction()` は新しいトランザクションを開始するのではなく、既存のトランザクションに参加します。

## ライフサイクル統合

`DatabaseService` は Zelt のライフサイクルシステムと統合されます：

```typescript
// @noErrors
import { createApp, http } from '@zeltjs/core';

const app = createApp([http({
    controllers: [OrderController],
  })], { configs: [DrizzleService] });
```

サービスは：
1. アプリ起動時に `setup()` を呼び出す
2. アプリシャットダウン時に `shutdown()` ハンドラーを呼び出す

## API リファレンス

### DatabaseService

| プロパティ/メソッド | 説明 |
|-------------------|------|
| `client` | 現在のデータベースクライアント（トランザクション対応） |
| `setup()` | 抽象: データベース接続を初期化 |
| `transaction(client, fn)` | 抽象: トランザクション内で関数を実行 |
| `withTransaction(fn)` | 新規または既存のトランザクション内で関数を実行 |
| `onShutdown(fn)` | シャットダウンハンドラーを登録 |

### ファクトリ関数

| 関数 | 説明 |
|-----|------|
| `createTransactionDecorator(Service)` | `@Transaction()` デコレーターを作成 |
| `createTransactionMiddleware(Service)` | トランザクションミドルウェアクラスを作成 |
