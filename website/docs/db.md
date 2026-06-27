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

Key points:

- `setup()` — Initialize and return your database client
- `transaction()` — Execute a function within a transaction
- `onShutdown()` — Register cleanup handlers for graceful shutdown

## Using the Database Service

### Direct Usage

Inject the service and access the client:

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

The `client` property automatically returns:
- The transaction client if inside a transaction
- The original client otherwise

### Transaction Decorator

Create a decorator for your database service:

```typescript
// @noErrors
import { createTransactionDecorator } from '@zeltjs/db';

export const Transaction = createTransactionDecorator(DrizzleService);
```

Apply it to methods that should run in a transaction:

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

All repository calls within `placeOrder` automatically use the same transaction. If any operation fails, the entire transaction rolls back.

### Transaction Middleware

For request-scoped transactions, use middleware:

```typescript
// @noErrors
import { createTransactionMiddleware } from '@zeltjs/db';

export const TransactionMiddleware = createTransactionMiddleware(DrizzleService);
```

Apply to controllers:

```typescript
// @noErrors
import { Controller, Post, UseMiddleware, request } from '@zeltjs/core';

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

Every request to this controller runs in a transaction.

## Transaction Propagation

Transactions propagate through async call chains automatically:

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

When `completeOrder` calls `processPayment`, both run in the same transaction — the inner `@Transaction()` joins the existing transaction rather than starting a new one.

## Lifecycle Integration

`DatabaseService` integrates with Zelt's lifecycle system:

```typescript
// @noErrors
import { createApp, http } from '@zeltjs/core';

const app = createApp([http({
    controllers: [OrderController],
  })], { configs: [DrizzleService] });
```

The service:
1. Calls `setup()` during app startup
2. Calls `shutdown()` handlers during app shutdown

## API Reference

### DatabaseService

| Property/Method | Description |
|----------------|-------------|
| `client` | Current database client (transaction-aware) |
| `setup()` | Abstract: Initialize database connection |
| `transaction(client, fn)` | Abstract: Execute function in transaction |
| `withTransaction(fn)` | Run function in a new or existing transaction |
| `onShutdown(fn)` | Register shutdown handler |

### Factory Functions

| Function | Description |
|----------|-------------|
| `createTransactionDecorator(Service)` | Create `@Transaction()` decorator |
| `createTransactionMiddleware(Service)` | Create transaction middleware class |
