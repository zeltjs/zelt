---
---

# Database

The `@zeltjs/db` package provides ORM-agnostic database abstraction with automatic transaction propagation using AsyncLocalStorage.

## Installation

```bash
pnpm add @zeltjs/db
```

## Overview

Zelt's database abstraction solves a common problem: propagating transactions through your service layer without passing transaction objects explicitly. Using Node.js AsyncLocalStorage, transactions automatically flow through async call chains.

## Creating a Database Service

Extend `DatabaseService` to integrate your ORM:

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

@Injectable()
export class DrizzleService extends DatabaseService<PostgresJsDatabase> {
  private readonly sql: postgres.Sql;

  constructor(config = inject(DatabaseConfig)) {
    super();
    this.sql = postgres(config.url);
  }

  async setup(): Promise<PostgresJsDatabase> {
    return drizzle(this.sql);
  }

  transaction<T>(
    client: PostgresJsDatabase,
    fn: (tx: PostgresJsDatabase) => Promise<T>,
  ): Promise<T> {
    return client.transaction(fn);
  }

  async shutdown(): Promise<void> {
    await this.sql.end();
  }
}
```

Key points:

- `setup()` — Initialize and return your database client
- `transaction()` — Execute a function within a transaction
- `shutdown()` — Close connections during graceful shutdown

## Using the Database Service

### Direct Usage

Inject the service and access the client:

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

@Injectable()
class DrizzleService extends DatabaseService<PostgresJsDatabase> {
  private readonly sql: postgres.Sql;
  constructor(config = inject(DatabaseConfig)) {
    super();
    this.sql = postgres(config.url);
  }
  async setup(): Promise<PostgresJsDatabase> {
    return drizzle(this.sql);
  }
  transaction<T>(client: PostgresJsDatabase, fn: (tx: PostgresJsDatabase) => Promise<T>): Promise<T> {
    return client.transaction(fn);
  }
  async shutdown(): Promise<void> {
    await this.sql.end();
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

The `client` property automatically returns:
- The transaction client if inside a transaction
- The original client otherwise

### Transaction Decorator

Create a decorator for your database service:

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

@Injectable()
class DrizzleService extends DatabaseService<PostgresJsDatabase> {
  private readonly sql: postgres.Sql;
  constructor(config = inject(DatabaseConfig)) {
    super();
    this.sql = postgres(config.url);
  }
  async setup(): Promise<PostgresJsDatabase> {
    return drizzle(this.sql);
  }
  transaction<T>(client: PostgresJsDatabase, fn: (tx: PostgresJsDatabase) => Promise<T>): Promise<T> {
    return client.transaction(fn);
  }
  async shutdown(): Promise<void> {
    await this.sql.end();
  }
}
// ---cut---
export const Transaction = createTransactionDecorator(DrizzleService);
```

Apply it to methods that should run in a transaction:

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

@Injectable()
class DrizzleService extends DatabaseService<PostgresJsDatabase> {
  private readonly sql: postgres.Sql;
  constructor(config = inject(DatabaseConfig)) {
    super();
    this.sql = postgres(config.url);
  }
  async setup(): Promise<PostgresJsDatabase> {
    return drizzle(this.sql);
  }
  transaction<T>(client: PostgresJsDatabase, fn: (tx: PostgresJsDatabase) => Promise<T>): Promise<T> {
    return client.transaction(fn);
  }
  async shutdown(): Promise<void> {
    await this.sql.end();
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

All repository calls within `placeOrder` automatically use the same transaction. If any operation fails, the entire transaction rolls back.

### Transaction Middleware

For request-scoped transactions, use middleware:

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

@Injectable()
class DrizzleService extends DatabaseService<PostgresJsDatabase> {
  private readonly sql: postgres.Sql;
  constructor(config = inject(DatabaseConfig)) {
    super();
    this.sql = postgres(config.url);
  }
  async setup(): Promise<PostgresJsDatabase> {
    return drizzle(this.sql);
  }
  transaction<T>(client: PostgresJsDatabase, fn: (tx: PostgresJsDatabase) => Promise<T>): Promise<T> {
    return client.transaction(fn);
  }
  async shutdown(): Promise<void> {
    await this.sql.end();
  }
}
// ---cut---
export const TransactionMiddleware = createTransactionMiddleware(DrizzleService);
```

Apply to controllers:

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

@Injectable()
class DrizzleService extends DatabaseService<PostgresJsDatabase> {
  private readonly sql: postgres.Sql;
  constructor(config = inject(DatabaseConfig)) {
    super();
    this.sql = postgres(config.url);
  }
  async setup(): Promise<PostgresJsDatabase> {
    return drizzle(this.sql);
  }
  transaction<T>(client: PostgresJsDatabase, fn: (tx: PostgresJsDatabase) => Promise<T>): Promise<T> {
    return client.transaction(fn);
  }
  async shutdown(): Promise<void> {
    await this.sql.end();
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

Every request to this controller runs in a transaction.

## Transaction Propagation

Transactions propagate through async call chains automatically:

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

@Injectable()
class DrizzleService extends DatabaseService<PostgresJsDatabase> {
  private readonly sql: postgres.Sql;
  constructor(config = inject(DatabaseConfig)) {
    super();
    this.sql = postgres(config.url);
  }
  async setup(): Promise<PostgresJsDatabase> {
    return drizzle(this.sql);
  }
  transaction<T>(client: PostgresJsDatabase, fn: (tx: PostgresJsDatabase) => Promise<T>): Promise<T> {
    return client.transaction(fn);
  }
  async shutdown(): Promise<void> {
    await this.sql.end();
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

When `completeOrder` calls `processPayment`, both run in the same transaction — the inner `@Transaction()` joins the existing transaction rather than starting a new one.

## Lifecycle Integration

`DatabaseService` integrates with Zelt's lifecycle system:

```typescript
import { Controller, Get, createApp, http } from '@zeltjs/core';

@Controller('/orders')
class OrderController {
  @Get('/')
  list() {
    return [];
  }
}
// ---cut---
const app = createApp([http({
    controllers: [OrderController],
  })]);
```

The service is registered with the lifecycle automatically the first time it is injected — there is no need to list it in `configs`. A concrete `@Config` class like `DatabaseConfig` resolves automatically too; `configs` is only needed to override a default or to supply a concrete implementation for an abstract config (see [Configuration](./configuration.md)). Once resolved:
1. Calls `setup()` during app startup
2. Calls `shutdown()` during app shutdown

## API Reference

### DatabaseService

| Property/Method | Description |
|----------------|-------------|
| `client` | Current database client (transaction-aware) |
| `setup()` | Abstract: Initialize database connection |
| `transaction(client, fn)` | Abstract: Execute function in transaction |
| `withTransaction(fn)` | Run function in a new or existing transaction |
| `shutdown()` | Abstract: Close connections on shutdown |

### Factory Functions

| Function | Description |
|----------|-------------|
| `createTransactionDecorator(Service)` | Create `@Transaction()` decorator |
| `createTransactionMiddleware(Service)` | Create transaction middleware class |
