---
sidebar_label: Drizzle Repository
---

# @zeltjs/drizzle-repository

A ZeltJS plugin that generates, from a drizzle `schema.ts`, Repositories that read and write per domain, and the types of their models.

A generated Repository has only methods that read by a key, plus `save` and `delete`. It tells IDs whose existence was confirmed apart by type, so code that reads with an unconfirmed ID, or saves while pointing to a row that does not exist, stops at type checking.

## Installation

```bash
npm install @zeltjs/drizzle-repository @zeltjs/db drizzle-metadata neverthrow
npm install -D @zeltjs/cli
```

`@zeltjs/core`, `@zeltjs/cli` and `drizzle-orm` are peer dependencies. `drizzle-orm` is supported at `0.45.x` and at `1.x` from `1.0.0-rc.5`.

The supported databases are SQLite, PostgreSQL and MySQL. If the schema has a table of any other database, generation fails.

## Workflow

1. Design which tables make one domain.
2. Write the tables and relations in `schema.ts`, and attach metadata.
3. Register the plugin in `zelt.config.ts` and generate.
4. Receive the generated base through DI and write the app's Repository.

## Designing domains

A domain is the unit that is read from and written to the DB at one time. One domain consists of one or more tables.

- Put several tables into one domain only when they are **always** fetched together.
  - If an order and its order items are always fetched together, the two are one domain.
  - If the list of orders does not need the items, the order and its order items are separate domains.
- A single save succeeds entirely or fails entirely only within one domain. Tables that break unless written together belong to the same domain.
- Whoever designs the schema decides how far one domain reaches. The generator does not judge it.

## Writing the schema

Write tables, keys and relations as drizzle has them. Write what drizzle lacks with `.meta()` of `drizzle-metadata`.

```ts
// @filename: drizzle-repository/src/db/guide-schema.ts
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { customer } from './schema';
// ---cut---
// src/db/schema.ts
import "drizzle-metadata/register";
import "@zeltjs/drizzle-repository/metadata";

export const order = sqliteTable("order", {
  id: text().primaryKey(),
  customer_id: text().notNull().references(() => customer.id),
  revision: integer().notNull().default(0).meta({ optimisticLock: true }),
  created_at: integer().notNull().default(sql`(unixepoch())`).meta({ excludedFromModel: true }),
});

export const orderItem = sqliteTable("order_item", {
  id: text().primaryKey(),
  order_id: text().notNull().references(() => order.id),
  name: text().notNull(),
});
```

Write relations the way the version of drizzle you use writes them.

```ts
// @filename: drizzle-repository/src/db/guide-relations.ts
import { relations } from 'drizzle-orm';
import { order, orderItem } from './schema';
// ---cut---
// drizzle 0.45.x
export const orderRelations = relations(order, ({ many }) => ({
  items: many(orderItem).meta({ includedInDomain: true }),
}));
```

```ts
// @noErrors
// drizzle 1.x
export const schemaRelations = defineRelations({ order, orderItem }, (r) => ({
  order: {
    items: r.many.orderItem().meta({ includedInDomain: true }),
  },
}));
```

This example makes an order and its order items one domain.

Importing `@zeltjs/drizzle-repository/metadata` adds the metadata keys below to the type of `.meta()`.

### Metadata

| Target | Metadata | Meaning |
|---|---|---|
| Relation | `includedInDomain: true` | Puts the table at the other end of the relation into the same domain as this table |
| Column | `excludedFromModel: true` | A column only the DB uses. It is not included in the model |
| Column | `optimisticLock: true` | A column used for optimistic locking. It can be attached only to a numeric column |

### Tables in the same domain

- The rows at the other end of a relation with `includedInDomain` go into a field of the model as an array. In the example above, that is `order.items`.
- The field's name is the key of the relation. It can be a name other than the table name.
- A relation without `includedInDomain` is not included in the model.
- A table that no relation points to with `includedInDomain` becomes the root of a domain. One Repository is generated per root.

### Columns excluded from the model

A column with `excludedFromModel` does not appear in the model. On creation the DB's default value goes in; on update the value in the DB stays as it is. Use it for creation and update timestamps.

### Types of column values

The type of a model field is the same as the type of the drizzle column. This plugin does not convert values.

Write conversions between DB values and JS values in the drizzle column definition. For timestamps use `integer({ mode: "timestamp" })`; for your own conversions use `customType`.

## Generating

Register the plugin in `zelt.config.ts`.

```ts
// @filename: drizzle-repository/src/app.ts
import { createApp } from '@zeltjs/core';
export const app = createApp([]);
// @filename: drizzle-repository/zelt.config.ts
// ---cut---
// zelt.config.ts
import { defineConfig } from "@zeltjs/cli";
import { drizzleRepositoryPlugin } from "@zeltjs/drizzle-repository";

export default defineConfig({
  app: () => import("./src/app").then((m) => m.app),
  plugins: [
    drizzleRepositoryPlugin({
      schema: "./src/db/schema.ts",
      database: { from: "./src/db/drizzle.service.ts", name: "DrizzleService" },
      out: {
        model: "./src/domain/generated",
        repository: "./src/db/generated",
      },
    }),
  ],
});
```

| Option | Meaning |
|---|---|
| `schema` | The file that exports the tables and relations. Several can be given as an array |
| `database` | The class that extends `DatabaseService` of `@zeltjs/db`, and the file that exports it. The generated Repositories read and write with this class's `client` |
| `out.model` | The folder the model types are written to |
| `out.repository` | The folder the Repositories are written to |

Create the `client` of the `database` class by passing the schema to drizzle. This is because the generated Repositories read a domain in a single query with drizzle's `db.query`.

```ts
// @noErrors
// drizzle 0.45.x
drizzle(connection, { schema });

// drizzle 1.x
drizzle({ client: connection, relations });
```

Generation runs before `zelt build` and `zelt dev`. To only generate, use the following command.

```bash
npx zelt-drizzle-repository generate --config zelt.config.ts
```

Do not edit the generated files. When you change `schema.ts`, generate again.

To check that the generated files match `schema.ts`, add `--check`. If they do not match, it fails. It does not rewrite any file. Use it in CI.

```bash
npx zelt-drizzle-repository generate --config zelt.config.ts --check
```

Generation fails in the following cases.

- `optimisticLock` is on a column that is not numeric.
- `optimisticLock` is on more than one column of one table.
- `optimisticLock` is on a column of a table that is not the root of a domain.
- A table pointed to with `includedInDomain` is pointed to from two or more tables.
- `includedInDomain` is on a relation that is not `many`.
- The primary key of a table in a domain is not a single column.

## What is generated

The examples assume a table exported under the name `user`. Type names are made by turning the exported name into UpperCamelCase. `orderItem` becomes `OrderItem`. No conversion between singular and plural is done.

### Types

| Type | Meaning |
|---|---|
| `UserId` | An ID only received from outside. The row does not necessarily exist |
| `UserExistedId` | An ID whose existence was confirmed |
| `User` | The model. Its `id` is `UserExistedId` |
| `NewUser` | The type used to create a new one. `User` with `id` replaced by `UserId` |

- An ID that points to another domain is a confirmed ID. If `User` has `tenant_id`, its type is `TenantExistedId`.
- The types are written to a file separate from the Repository. They refer to `schema.ts` only with `import type`, so they do not load drizzle at run time.

### Repository

A class `UserRepositoryBase` with `@Injectable()` is generated.

```ts
// @noErrors
isExisted(id: UserId): ResultAsync<UserExistedId | NOT_EXIST, DbError>
getById(id: UserExistedId): ResultAsync<User, EntityNotFoundError | DbError>

isExistedBy<UniqueKey>(key): ResultAsync<{ id: UserExistedId } | { id: NOT_EXIST, ...key }, DbError>

findBy<ForeignKey>(key): ResultAsync<User[], DbError>

save({ pre, input }): ResultAsync<User, ConflictError | DbError>
delete(model: User): ResultAsync<void, ConflictError | DbError>
```

The return values are neverthrow `ResultAsync`. Nothing throws. DB failures are also returned in the `ResultAsync`.

The methods are determined by the keys in `schema.ts`.

| Key | Generated methods | Argument |
|---|---|---|
| Primary key | `isExisted`, `getById` | The ID value |
| Unique key | A name per set of columns, such as `isExistedBySlug` | The value for one column. For several columns, an object with all of the columns |
| Foreign key | A name per set of columns, such as `findByProductId` | A confirmed ID |

When the same set of columns is both a unique key and a foreign key, it is treated as a unique key.

## Writing the app's Repository

Do not use the generated base as it is. The app's Repository receives the base with `inject()` and exposes only the methods it uses.

```ts
// @filename: drizzle-repository/src/user/user.repository.ts
import { Injectable, inject } from '@zeltjs/core';
import { UserRepositoryBase } from '../db/generated/user.repository-base';
// ---cut---
// src/user/user.query.repository.ts
@Injectable()
export class UserQueryRepository {
  private readonly base = inject(UserRepositoryBase);
  public isExisted = this.base.isExisted.bind(this.base);
  public getById = this.base.getById.bind(this.base);
  public isExistedByEmail = this.base.isExistedByEmail.bind(this.base);
}

// src/user/user.command.repository.ts
@Injectable()
export class UserCommandRepository {
  private readonly base = inject(UserRepositoryBase);
  public save = this.base.save.bind(this.base);
  public delete = this.base.delete.bind(this.base);
}
```

- Split it into one for reading and one for writing. The one for reading does not expose `save` and `delete`.
- Do not extend the base. Extending it exposes all of its methods.

## Reading

### Reading by ID

Confirm existence before reading. `getById` accepts only confirmed IDs.

```ts
// @filename: drizzle-repository/src/user/example.ts
import { NOT_EXIST } from '@zeltjs/drizzle-repository';
import { err } from 'neverthrow';
import type { UserExistedId, UserId } from '../domain/generated/user.model';
import { UserRepositoryBase } from '../db/generated/user.repository-base';
declare const rejected: (reason: string) => unknown;
export class Example {
  constructor(
    private readonly users: UserRepositoryBase,
  ) {}
  async run(input: { user_id: UserId }) {
// ---cut---
const existed = await this.users.isExisted(input.user_id);
if (existed.isErr()) return err(existed.error);
if (existed.value === NOT_EXIST) return rejected("not_found");

const user = await this.users.getById(existed.value);
// ---cut-after---
  }
}
```

- `isExisted` returns the confirmed ID if the row exists, and `NOT_EXIST` if it does not. A missing row is not an error.
- `getById` assumes the row exists. If the row does not exist, it returns `EntityNotFoundError`.

### Checking a unique key

`isExistedBy<UniqueKey>` returns whether a row exists or not as the type of the checked result.

```ts
// @filename: drizzle-repository/src/user/example.ts
import { NOT_EXIST } from '@zeltjs/drizzle-repository';
import { err } from 'neverthrow';
import type { UserExistedId, UserId } from '../domain/generated/user.model';
import { UserRepositoryBase } from '../db/generated/user.repository-base';
export class Example {
  constructor(
    private readonly users: UserRepositoryBase,
  ) {}
  async run(input: { email: string }) {
// ---cut---
const checked = await this.users.isExistedByEmail(input.email);
if (checked.isErr()) return err(checked.error);

if (checked.value.id === NOT_EXIST) {
  // checked.value is { id: NOT_EXIST, email }: a value confirming that no row has this email
} else {
  // checked.value.id is a UserExistedId, which can be passed to getById
}
// ---cut-after---
  }
}
```

- There is no method that reads by a unique key. Pass the returned ID to `getById` to read.
- To tell whether an update collides with itself, compare the returned `id` with its own `id`.

### Reading by foreign key

`findBy<ForeignKey>` returns an array of models.

### Rules of reading

- A complete model is always returned. The rows of the tables in the same domain are returned with it.
- You cannot select columns to read, or choose relations to include.
- One domain is fetched in a single query.

## Writing

### Creating

Passing `null` as `pre` of `save` creates. Pass the type used to create a new one, `NewUser`, as `input`.

```ts
// @filename: drizzle-repository/src/user/example.ts
import { err } from 'neverthrow';
import type { UserExistedId, UserId } from '../domain/generated/user.model';
import { UserRepositoryBase } from '../db/generated/user.repository-base';
declare const newUserId: () => UserId;
export class Example {
  constructor(
    private readonly userCommands: UserRepositoryBase,
  ) {}
  async run(email: string) {
// ---cut---
const created = await this.userCommands.save({
  pre: null,
  input: { id: newUserId(), name: "Alice", email },
});
if (created.isErr()) return err(created.error);

// created.value is a User, and its id is now a UserExistedId
// ---cut-after---
  }
}
```

### Updating

Pass the model you read as `pre`, and the changed model as `input`.

```ts
// @filename: drizzle-repository/src/user/example.ts
import { err } from 'neverthrow';
import type { UserExistedId, UserId } from '../domain/generated/user.model';
import { UserRepositoryBase } from '../db/generated/user.repository-base';
export class Example {
  constructor(
    private readonly users: UserRepositoryBase,
    private readonly userCommands: UserRepositoryBase,
  ) {}
  async run(userExistedId: UserExistedId) {
// ---cut---
const user = await this.users.getById(userExistedId);
if (user.isErr()) return err(user.error);

const saved = await this.userCommands.save({
  pre: user.value,
  input: { ...user.value, name: "Bob" },
});
if (saved.isErr()) return err(saved.error);
// ---cut-after---
  }
}
```

- `input` is a complete model. You cannot pass only some of the fields.
- In a domain made of several tables, `pre` and `input` are compared row by row, and only the rows that changed are written. Rows added in `input` are inserted, and rows removed are deleted.

```ts
// @filename: drizzle-repository/src/user/example.ts
import { err } from 'neverthrow';
import type { OrderExistedId } from '../domain/generated/order.model';
import { OrderRepositoryBase } from '../db/generated/order.repository-base';
declare const itemB: string;
declare const itemC: string;
declare const newOrderItemId: () => string;
export class Example {
  constructor(
    private readonly orders: OrderRepositoryBase,
    private readonly orderCommands: OrderRepositoryBase,
  ) {}
  async run(orderExistedId: OrderExistedId) {
// ---cut---
const order = await this.orders.getById(orderExistedId);
if (order.isErr()) return err(order.error);

// Change only the name of item B, add item D, and drop item C
const input = {
  ...order.value,
  items: [
    ...order.value.items
      .filter((item) => item.id !== itemC)
      .map((item) => (item.id === itemB ? { ...item, name: "new name" } : item)),
    { id: newOrderItemId(), order_id: order.value.id, name: "D" },
  ],
};

const saved = await this.orderCommands.save({ pre: order.value, input });
// Only the update of item B, the insert of item D and the delete of item C are written
// ---cut-after---
  }
}
```

### Deleting

Pass the model you read. The rows of the tables in the same domain are deleted with it.

In a domain without an `optimisticLock` column, if the row is already gone, it does nothing and succeeds.

```ts
// @filename: drizzle-repository/src/user/example.ts
import { err } from 'neverthrow';
import type { UserExistedId, UserId } from '../domain/generated/user.model';
import { UserRepositoryBase } from '../db/generated/user.repository-base';
export class Example {
  constructor(
    private readonly users: UserRepositoryBase,
    private readonly userCommands: UserRepositoryBase,
  ) {}
  async run(userExistedId: UserExistedId) {
// ---cut---
const user = await this.users.getById(userExistedId);
if (user.isErr()) return err(user.error);

const deleted = await this.userCommands.delete(user.value);
if (deleted.isErr()) return err(deleted.error);
// ---cut-after---
  }
}
```

### Rules of writing

- `save` and `delete` write to the DB as soon as they are called.
- One `save` or `delete` writes all tables of the domain, succeeding entirely or failing entirely.

### Saving several domains

One `save` or `delete` succeeds entirely or fails entirely only within one domain.

- To roll back the saves of several domains together, save inside `@Transaction()` of `@zeltjs/db` on a DB that has transactions.
- On a DB that has no transaction spanning several saves, such as D1, the saves that ran first remain.

### Optimistic locking

In a domain with a column that has `optimisticLock`, `save` and `delete` prevent overwrites.

- When writing, the condition is that the lock column of the root table matches the value in `pre`. If the condition holds, the lock column advances by 1.
- If the condition does not hold, nothing is written to the domain and `ConflictError` is returned.

```ts
// @filename: drizzle-repository/src/user/example.ts
import { ConflictError } from '@zeltjs/drizzle-repository';
import type { OrderExistedId } from '../domain/generated/order.model';
import { OrderRepositoryBase } from '../db/generated/order.repository-base';
export class Example {
  constructor(
    private readonly orders: OrderRepositoryBase,
    private readonly orderCommands: OrderRepositoryBase,
  ) {}
  async run(orderExistedId: OrderExistedId) {
    const order = await this.orders.getById(orderExistedId);
    if (order.isErr()) return;
    const input = order.value;
// ---cut---
const saved = await this.orderCommands.save({ pre: order.value, input });
if (saved.isErr() && saved.error instanceof ConflictError) {
  // Another process rewrote this order after it was read. The caller decides whether to read it again
}
// ---cut-after---
  }
}
```

- It becomes `ConflictError` when another process rewrote the same domain between reading and saving.
- The scope of the lock is one domain. Saves to the same domain conflict even when the changes are unrelated. A save that changes only the items still advances the lock column of the root.
- Whether to retry on `ConflictError` is decided by the caller of `save`.

## Staging models before saving

When processing several items in order, later items' reads refer to the models an earlier item plans to save. A staging layer is added between the app and the DB, and reads within the scope look at staging, then the DB. Processing written for one item can be used for several items without rewriting it.

Staging is a layer for reading. Staging does not write to the DB. When to write to the DB is decided by the user.

```ts
// @noErrors
import { withStagingScope, stage } from "@zeltjs/drizzle-repository";

await withStagingScope(async () => {
  for (const row of rows) {
    // A User staged for an earlier row looks the same as a User in the DB
    const checked = await this.users.isExistedByEmail(row.email);
    if (checked.isErr()) return err(checked.error);
    if (checked.value.id !== NOT_EXIST) continue;

    const staged = stage("User", { pre: null, input: { id: newUserId(), email: row.email } });
    if (staged.isErr()) return err(staged.error);
  }
});
```

| Function | Meaning |
|---|---|
| `withStagingScope(fn)` | Creates a scope in which staging is active. When `fn` finishes, the staged models are gone |
| `stage(name, { pre, input })` | Stages a model to be saved. The name is the name of the model type. Pass the same value you pass to `save` |
| `stageDelete(name, model)` | Stages a model to be deleted |

### Reads that look at the stage

| Look at it | Do not look at it |
|---|---|
| `isExisted`, `getById`, `isExistedBy<UniqueKey>` | `findBy<ForeignKey>` |

- `findBy<ForeignKey>` does not look at staging. Staging holds only some of the rows, so a read that returns several rows cannot have a complete result from staging alone.
- Within the scope, a confirmed ID means "it is in the DB, or it is staged".
- A model staged for deletion is treated as missing. `isExisted` returns `NOT_EXIST`, and `getById` returns `EntityNotFoundError`.

### Rules of staging

- If the primary key or a unique key is the same as an already staged model, `stage` returns `StagingDuplicateError`. `stageDelete` also returns `StagingDuplicateError` if the primary key is the same as an already staged model. A key containing NULL is not treated as a duplicate.
- Calling `stage` or `stageDelete` outside a scope throws.
- Creating another scope inside a scope throws.

### Runtime environment

The scope is carried by Node.js `AsyncLocalStorage`. Asynchronous work called from inside `fn` sees the stage of the same scope.

A runtime environment where `AsyncLocalStorage` is available is required. On Cloudflare Workers, with a compatibility date of `2026-08-04` or later it works as it is. Before that, add the `nodejs_compat` flag.

## What is not generated

The following are not generated. If needed, write them yourself in the app's Repository.

- Searches by conditions other than keys
- Methods that read several IDs at once
- Reads that do not return models (list screens, aggregation)
- Methods from NULL-able keys, or from unique indexes with expressions or conditions
- Value validation and business decisions
