# @zeltjs/db

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

ORM-agnostic database abstraction with transaction propagation for Zelt applications.

**[Read the Documentation](https://zeltjs.com)**

## Installation

```bash
npm install @zeltjs/db @zeltjs/core
```

## Usage

Extend `DatabaseService` for your driver. `setup()` returns everything the
lifecycle should seal into `this.ready` — at minimum `{ client }`, plus any
extra handles (e.g. a raw connection pool) that `shutdown()` needs to close:

```typescript
import postgres from 'postgres';
import { DatabaseService } from '@zeltjs/db';

class PostgresService extends DatabaseService<
  postgres.TransactionSql,
  { client: postgres.TransactionSql; sql: postgres.Sql }
> {
  async setup() {
    const sql = postgres(process.env.DATABASE_URL!);
    return { client: sql, sql };
  }

  transaction<T>(client: postgres.Sql, fn: (tx: postgres.TransactionSql) => Promise<T>) {
    return client.begin(fn);
  }

  async shutdown() {
    await this.ready.sql.end();
  }
}
```

Register the service and use `createTransactionDecorator` to run controller
methods inside a transaction:

```typescript
import { createApp, http, Controller, Post, inject } from '@zeltjs/core';
import { DbConfig, createTransactionDecorator } from '@zeltjs/db';

const Transactional = createTransactionDecorator(PostgresService);

@Controller('/users')
class UserController {
  constructor(private db = inject(PostgresService)) {}

  @Post('/')
  @Transactional()
  createUser() {
    // runs within a transaction; this.db.client is the tx client
  }
}

const app = createApp([http({ controllers: [UserController] })], {
  configs: [DbConfig],
});
```
