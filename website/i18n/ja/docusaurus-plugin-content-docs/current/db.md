---
---

# データベース

`@zeltjs/db` パッケージは、AsyncLocalStorageを使った自動トランザクション伝播により、ORMに依存しないデータベース抽象化を提供します。

## インストール {#installation}

```bash
pnpm add @zeltjs/db
```

## 概要 {#overview}

Zeltのデータベース抽象化は、よくある問題を解決します: トランザクションオブジェクトを明示的に渡すことなく、service層を通じてトランザクションを伝播させることです。Node.jsのAsyncLocalStorageを使うことで、トランザクションはasyncの呼び出しチェーンを自動的に流れます。

## データベースServiceの作成 {#creating-a-database-service}

`DatabaseService` を継承して、あなたのORMを統合します:

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

主なポイント:

- `setup()` — データベースクライアントを初期化して返す
- `transaction()` — トランザクション内で関数を実行する
- `onShutdown()` — グレースフルシャットダウン用のクリーンアップハンドラを登録する

## データベースServiceの使用 {#using-the-database-service}

### 直接利用 {#direct-usage}

serviceをinjectしてクライアントにアクセスします:

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

`client` プロパティは自動的に以下を返します:
- トランザクション内であればトランザクションクライアント
- そうでなければ元のクライアント

### トランザクションデコレータ {#transaction-decorator}

データベースserviceのためのデコレータを作成します:

```typescript
// @noErrors
import { createTransactionDecorator } from '@zeltjs/db';

export const Transaction = createTransactionDecorator(DrizzleService);
```

トランザクション内で実行すべきメソッドに適用します:

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

`placeOrder` 内のすべてのrepository呼び出しは自動的に同じトランザクションを使います。いずれかの操作が失敗すると、トランザクション全体がロールバックされます。

### トランザクションミドルウェア {#transaction-middleware}

リクエストスコープのトランザクションには、ミドルウェアを使います:

```typescript
// @noErrors
import { createTransactionMiddleware } from '@zeltjs/db';

export const TransactionMiddleware = createTransactionMiddleware(DrizzleService);
```

controllerに適用します:

```typescript
// @noErrors
import { Controller, Post, UseMiddleware, inject, request } from '@zeltjs/core';

@Controller('/orders')
@UseMiddleware(TransactionMiddleware)
export class OrderController {
  constructor(private orderService = inject(OrderService)) {}

  @Post('/')
  async create(req = request()) {
    const data = await req.body();
    return this.orderService.placeOrder(data.userId, data.items);
  }
}
```

このcontrollerへのすべてのリクエストはトランザクション内で実行されます。

## トランザクションの伝播 {#transaction-propagation}

トランザクションはasyncの呼び出しチェーンを自動的に伝播します:

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

`completeOrder` が `processPayment` を呼び出すとき、両方とも同じトランザクション内で実行されます — 内側の `@Transaction()` は新しいトランザクションを開始するのではなく、既存のトランザクションに合流します。

## ライフサイクル統合 {#lifecycle-integration}

`DatabaseService` はZeltのライフサイクルシステムと統合します:

```typescript
// @noErrors
import { createApp, http } from '@zeltjs/core';

const app = createApp([http({
    controllers: [OrderController],
  })], { configs: [DrizzleService] });
```

このserviceは:
1. アプリ起動時に `setup()` を呼び出す
2. アプリシャットダウン時に `shutdown()` ハンドラを呼び出す

## APIリファレンス {#api-reference}

### DatabaseService {#databaseservice}

| プロパティ/メソッド | 説明 |
|----------------|-------------|
| `client` | 現在のデータベースクライアント(トランザクション対応) |
| `setup()` | 抽象: データベース接続を初期化する |
| `transaction(client, fn)` | 抽象: 関数をトランザクション内で実行する |
| `withTransaction(fn)` | 新規または既存のトランザクション内で関数を実行する |
| `onShutdown(fn)` | シャットダウンハンドラを登録する |

### ファクトリ関数 {#factory-functions}

| 関数 | 説明 |
|----------|-------------|
| `createTransactionDecorator(Service)` | `@Transaction()` デコレータを作成する |
| `createTransactionMiddleware(Service)` | トランザクションミドルウェアクラスを作成する |
