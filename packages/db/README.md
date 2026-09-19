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
service needs later: at minimum `{ client }`, plus any handle `shutdown()`
must close. The returned object is sealed into `this.ready`, so nothing is
created in the constructor. This example is the same one that is type-checked
in the documentation:

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

Inject the service where you need the client, and use
`createTransactionDecorator` to run methods inside a transaction:

```typescript
import { Injectable, inject } from '@zeltjs/core';
import { createTransactionDecorator } from '@zeltjs/db';

const Transaction = createTransactionDecorator(DrizzleService);

@Injectable()
class UserService {
  constructor(private db = inject(DrizzleService)) {}

  @Transaction()
  async createUser(name: string, email: string) {
    // this.db.client is the transaction client inside this method
  }
}
```

`DrizzleService` is an ordinary injectable: the first time something injects
it, it is constructed and registered with the lifecycle automatically, so
`setup()` runs on app startup and `shutdown()` on app shutdown.
