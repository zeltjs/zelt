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
import { Config, Env, Injectable, inject } from '@zeltjs/core';
import { DatabaseService } from '@zeltjs/db';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

@Config
export class DatabaseConfig {
  constructor(private env = inject(Env)) {}

  get url(): string {
    return this.env.getStringOrThrow('DATABASE_URL');
  }
}

type DrizzleReady = { client: PostgresJsDatabase; sql: postgres.Sql };

@Injectable()
export class DrizzleService extends DatabaseService<PostgresJsDatabase, DrizzleReady> {
  constructor(private config = inject(DatabaseConfig)) {
    super();
  }

  async setup(): Promise<DrizzleReady> {
    const sql = postgres(this.config.url);
    return { client: drizzle(sql), sql };
  }

  transaction<T>(
    client: PostgresJsDatabase,
    fn: (tx: PostgresJsDatabase) => Promise<T>,
  ): Promise<T> {
    return client.transaction(fn);
  }

  async shutdown(): Promise<void> {
    await this.ready.sql.end();
  }
}
```

主なポイント:

- `setup()` — `shutdown()` が必要とするクライアントとハンドル(例: 生の接続プール)を作成する。戻り値は `this.ready` に封印される
- `transaction()` — トランザクション内で関数を実行
- `shutdown()` — `this.ready` に保持された接続をグレースフルシャットダウン時にクローズ

## データベースServiceの使用 {#using-the-database-service}

### 直接利用 {#direct-usage}

serviceをinjectしてクライアントにアクセスします:

```typescript
import { Config, Env, Injectable, inject } from '@zeltjs/core';
import { DatabaseService } from '@zeltjs/db';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import postgres from 'postgres';

@Config
class DatabaseConfig {
  constructor(private env = inject(Env)) {}
  get url(): string {
    return this.env.getStringOrThrow('DATABASE_URL');
  }
}

type DrizzleReady = { client: PostgresJsDatabase; sql: postgres.Sql };

@Injectable()
class DrizzleService extends DatabaseService<PostgresJsDatabase, DrizzleReady> {
  constructor(private config = inject(DatabaseConfig)) {
    super();
  }
  async setup(): Promise<DrizzleReady> {
    const sql = postgres(this.config.url);
    return { client: drizzle(sql), sql };
  }
  transaction<T>(client: PostgresJsDatabase, fn: (tx: PostgresJsDatabase) => Promise<T>): Promise<T> {
    return client.transaction(fn);
  }
  async shutdown(): Promise<void> {
    await this.ready.sql.end();
  }
}

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
});
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
import { Config, Env, Injectable, inject } from '@zeltjs/core';
import { createTransactionDecorator, DatabaseService } from '@zeltjs/db';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

@Config
class DatabaseConfig {
  constructor(private env = inject(Env)) {}
  get url(): string {
    return this.env.getStringOrThrow('DATABASE_URL');
  }
}

type DrizzleReady = { client: PostgresJsDatabase; sql: postgres.Sql };

@Injectable()
class DrizzleService extends DatabaseService<PostgresJsDatabase, DrizzleReady> {
  constructor(private config = inject(DatabaseConfig)) {
    super();
  }
  async setup(): Promise<DrizzleReady> {
    const sql = postgres(this.config.url);
    return { client: drizzle(sql), sql };
  }
  transaction<T>(client: PostgresJsDatabase, fn: (tx: PostgresJsDatabase) => Promise<T>): Promise<T> {
    return client.transaction(fn);
  }
  async shutdown(): Promise<void> {
    await this.ready.sql.end();
  }
}
// ---cut---
export const Transaction = createTransactionDecorator(DrizzleService);
```

トランザクション内で実行すべきメソッドに適用します:

```typescript
import { Config, Env, Injectable, inject } from '@zeltjs/core';
import { createTransactionDecorator, DatabaseService } from '@zeltjs/db';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

@Config
class DatabaseConfig {
  constructor(private env = inject(Env)) {}
  get url(): string {
    return this.env.getStringOrThrow('DATABASE_URL');
  }
}

type DrizzleReady = { client: PostgresJsDatabase; sql: postgres.Sql };

@Injectable()
class DrizzleService extends DatabaseService<PostgresJsDatabase, DrizzleReady> {
  constructor(private config = inject(DatabaseConfig)) {
    super();
  }
  async setup(): Promise<DrizzleReady> {
    const sql = postgres(this.config.url);
    return { client: drizzle(sql), sql };
  }
  transaction<T>(client: PostgresJsDatabase, fn: (tx: PostgresJsDatabase) => Promise<T>): Promise<T> {
    return client.transaction(fn);
  }
  async shutdown(): Promise<void> {
    await this.ready.sql.end();
  }
}

const Transaction = createTransactionDecorator(DrizzleService);

type OrderItem = { productId: string; quantity: number };

@Injectable()
class OrderRepository {
  async create(userId: string, items: OrderItem[]) {
    return { id: 'order-1', userId, items };
  }
}

@Injectable()
class InventoryRepository {
  async decrement(productId: string, quantity: number) {}
}
// ---cut---
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
import { Config, Env, Injectable, inject } from '@zeltjs/core';
import { createTransactionMiddleware, DatabaseService } from '@zeltjs/db';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

@Config
class DatabaseConfig {
  constructor(private env = inject(Env)) {}
  get url(): string {
    return this.env.getStringOrThrow('DATABASE_URL');
  }
}

type DrizzleReady = { client: PostgresJsDatabase; sql: postgres.Sql };

@Injectable()
class DrizzleService extends DatabaseService<PostgresJsDatabase, DrizzleReady> {
  constructor(private config = inject(DatabaseConfig)) {
    super();
  }
  async setup(): Promise<DrizzleReady> {
    const sql = postgres(this.config.url);
    return { client: drizzle(sql), sql };
  }
  transaction<T>(client: PostgresJsDatabase, fn: (tx: PostgresJsDatabase) => Promise<T>): Promise<T> {
    return client.transaction(fn);
  }
  async shutdown(): Promise<void> {
    await this.ready.sql.end();
  }
}
// ---cut---
export const TransactionMiddleware = createTransactionMiddleware(DrizzleService);
```

controllerに適用します:

```typescript
import { Config, Controller, Env, Injectable, Post, UseMiddleware, inject, request } from '@zeltjs/core';
import { createTransactionMiddleware, DatabaseService } from '@zeltjs/db';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as v from 'valibot';

@Config
class DatabaseConfig {
  constructor(private env = inject(Env)) {}
  get url(): string {
    return this.env.getStringOrThrow('DATABASE_URL');
  }
}

type DrizzleReady = { client: PostgresJsDatabase; sql: postgres.Sql };

@Injectable()
class DrizzleService extends DatabaseService<PostgresJsDatabase, DrizzleReady> {
  constructor(private config = inject(DatabaseConfig)) {
    super();
  }
  async setup(): Promise<DrizzleReady> {
    const sql = postgres(this.config.url);
    return { client: drizzle(sql), sql };
  }
  transaction<T>(client: PostgresJsDatabase, fn: (tx: PostgresJsDatabase) => Promise<T>): Promise<T> {
    return client.transaction(fn);
  }
  async shutdown(): Promise<void> {
    await this.ready.sql.end();
  }
}

const TransactionMiddleware = createTransactionMiddleware(DrizzleService);

const PlaceOrderBody = v.object({
  userId: v.string(),
  items: v.array(v.object({ productId: v.string(), quantity: v.number() })),
});

@Injectable()
class OrderService {
  async placeOrder(userId: string, items: { productId: string; quantity: number }[]) {
    return { id: 'order-1', userId, items };
  }
}
// ---cut---
@Controller('/orders')
@UseMiddleware(TransactionMiddleware)
export class OrderController {
  constructor(private orderService = inject(OrderService)) {}

  @Post('/')
  async create(req = request(PlaceOrderBody)) {
    const data = await req.body();
    return this.orderService.placeOrder(data.userId, data.items);
  }
}
```

このcontrollerへのすべてのリクエストはトランザクション内で実行されます。

## トランザクションの伝播 {#transaction-propagation}

トランザクションはasyncの呼び出しチェーンを自動的に伝播します:

```typescript
import { Config, Env, Injectable, inject } from '@zeltjs/core';
import { createTransactionDecorator, DatabaseService } from '@zeltjs/db';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

@Config
class DatabaseConfig {
  constructor(private env = inject(Env)) {}
  get url(): string {
    return this.env.getStringOrThrow('DATABASE_URL');
  }
}

type DrizzleReady = { client: PostgresJsDatabase; sql: postgres.Sql };

@Injectable()
class DrizzleService extends DatabaseService<PostgresJsDatabase, DrizzleReady> {
  constructor(private config = inject(DatabaseConfig)) {
    super();
  }
  async setup(): Promise<DrizzleReady> {
    const sql = postgres(this.config.url);
    return { client: drizzle(sql), sql };
  }
  transaction<T>(client: PostgresJsDatabase, fn: (tx: PostgresJsDatabase) => Promise<T>): Promise<T> {
    return client.transaction(fn);
  }
  async shutdown(): Promise<void> {
    await this.ready.sql.end();
  }
}

const Transaction = createTransactionDecorator(DrizzleService);

@Injectable()
class LedgerRepository {
  async debit(orderId: string, amount: number) {}
}

@Injectable()
class NotificationService {
  async sendReceipt(orderId: string) {}
}

@Injectable()
class OrderRepository {
  async markComplete(orderId: string) {}
}
// ---cut---
@Injectable()
export class PaymentService {
  constructor(
    private ledgerRepo = inject(LedgerRepository),
    private notificationService = inject(NotificationService),
  ) {}

  @Transaction()
  async processPayment(orderId: string, amount: number) {
    await this.ledgerRepo.debit(orderId, amount);
    await this.notificationService.sendReceipt(orderId);
  }
}

@Injectable()
export class OrderService {
  constructor(
    private orderRepo = inject(OrderRepository),
    private paymentService = inject(PaymentService),
  ) {}

  @Transaction()
  async completeOrder(orderId: string) {
    await this.orderRepo.markComplete(orderId);
    await this.paymentService.processPayment(orderId, 100);
  }
}
```

`completeOrder` が `processPayment` を呼び出すとき、両方とも同じトランザクション内で実行されます — 内側の `@Transaction()` は新しいトランザクションを開始するのではなく、既存のトランザクションに合流します。

## ライフサイクル統合 {#lifecycle-integration}

`DatabaseService` はZeltのライフサイクルシステムと統合します。`DrizzleService` は通常の injectable であり、誰かが「登録」するものではありません。何か(例えば repository)が最初にそれを inject した時点で自動的に構築され、`LifecycleManager` に登録されます。アプリは実際にリクエストを処理し始める前に、未実行の lifecycle をすべて実行します:

1. 起動時に `setup()` が呼ばれ、その戻り値が `this.ready` に封印される
2. シャットダウン時に `shutdown()` が呼ばれる

## APIリファレンス {#api-reference}

### DatabaseService {#databaseservice}

| プロパティ/メソッド | 説明 |
|-------------------|------|
| `client` | 現在のデータベースクライアント（トランザクション対応） |
| `ready` | Protected: `setup()` の戻り値から封印された `ReadyValue`。起動前にアクセスすると例外を投げる |
| `setup()` | 抽象: クライアントとシャットダウンに必要なハンドルを作成する。戻り値は `ready` に封印される |
| `transaction(client, fn)` | 抽象: トランザクション内で関数を実行 |
| `withTransaction(fn)` | 新規または既存のトランザクション内で関数を実行 |
| `shutdown()` | 抽象: シャットダウン時に接続をクローズ |

### ファクトリ関数 {#factory-functions}

| 関数 | 説明 |
|----------|-------------|
| `createTransactionDecorator(Service)` | `@Transaction()` デコレータを作成する |
| `createTransactionMiddleware(Service)` | トランザクションミドルウェアクラスを作成する |
