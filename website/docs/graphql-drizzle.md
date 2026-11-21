---
sidebar_label: GraphQL × Drizzle
---

# Exposing Drizzle Tables over GraphQL

`@zeltjs/graphql-drizzle` generates GraphQL model types and resolver foundations from the tables and relations you define with Drizzle.

The generated code fetches column values and relations. You write only "which data to return (Query)" and "app-specific computed fields". When you change the DB schema, rebuilding is all it takes for the GraphQL side to follow.

This page assumes the Code-first approach of [GraphQL](./graphql.md) (`@Query` selects IDs, and fields are resolved from IDs).

## What It Does and Does Not Do {#scope}

| Generated | Not generated (you write these) |
| --- | --- |
| A model type per table (`interface User`) | Root `@Query` (which rows to return, under which conditions) |
| Fetching column values for IDs in batches | Computed fields (`@ResolveField`) |
| Relations matching Drizzle's `relations()` | Authorization, filtering, paging |
| | Validation of incoming IDs (the `args()` validator) |

Mutations are not generated. `where` clauses and ordering differ by app, so they are not generated as Queries; you write them as ordinary `@Query` methods.

## Requirements {#requirements}

- `drizzle-orm` 0.45.x. Relations are defined with `relations()`.
- PostgreSQL or SQLite.
- The DB client comes from a service that extends `DatabaseService` from `@zeltjs/db` ([Database](./db.md)). The generated code uses this service's `client` too, so transaction propagation keeps working.

```bash
pnpm add @zeltjs/graphql-drizzle drizzle-metadata@0.0.1
```

## Configuration {#configuration}

Register `drizzleGraphqlPlugin()` in `zelt.config.ts`. **Place it before `graphqlPlugin()`**, because `graphqlPlugin()` analyzes the generated code.

```ts
// @filename: graphql-drizzle/zelt.config.ts
// ---cut---
import { defineConfig } from '@zeltjs/cli';
import { graphqlPlugin } from '@zeltjs/graphql/codegen';
import { drizzleGraphqlPlugin } from '@zeltjs/graphql-drizzle/codegen';
import { valibotAdapter } from '@zeltjs/validator-valibot/openapi';

export default defineConfig({
  app: () => import('./src/app').then((m) => m.app),
  plugins: [
    drizzleGraphqlPlugin({
      schema: './src/db/schema.ts',
      database: { module: './src/db/drizzle.service.ts', export: 'DrizzleService' },
      out: './src/generated/drizzle-graphql.ts',
    }),
    graphqlPlugin({ schemaAdapter: valibotAdapter }),
  ],
  build: { entry: './src/node.ts' },
  dev: { entry: './src/node.ts' },
});
```

| Option | Description |
| --- | --- |
| `schema` | The module that exports the tables and `relations()` |
| `database` | The module and export name of the service that extends `DatabaseService` |
| `out` | Output path of the generated file |

`zelt build` and `zelt dev` regenerate `out` on every build. Generation loads only the `schema` module, not the app. So even on the first build, it is fine for the app to import the generated file.

Do not edit the generated file; the next build overwrites it. All customization happens in the resolvers and the schema, as described below.

## Writing the Schema {#schema}

Write tables and relations in Drizzle as usual.

```ts
// @filename: graphql-drizzle/src/db/schema.ts
// ---cut---
// src/db/schema.ts
import 'drizzle-metadata/register';
import '@zeltjs/graphql-drizzle/metadata';
import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import * as v from 'valibot';

export const UserId = v.pipe(v.string(), v.uuid(), v.brand('UserId'));
export type UserId = v.InferOutput<typeof UserId>;
export type PostId = string & v.Brand<'PostId'>;

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom().$type<UserId>(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  passwordHash: text('password_hash').notNull().meta({ graphqlHidden: true }),
}).meta({ graphqlName: 'User' });

export const posts = pgTable('posts', {
  id: uuid().primaryKey().defaultRandom().$type<PostId>(),
  title: text().notNull(),
  authorId: uuid('author_id').$type<UserId>().notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow().meta({ graphqlHidden: true }),
}).meta({ graphqlName: 'Post' });

export const sessions = pgTable('sessions', {
  id: uuid().primaryKey(),
  userId: uuid('user_id').$type<UserId>().notNull().references(() => users.id),
}).meta({ graphqlHidden: true });

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  sessions: many(sessions),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));
```

### Controlling Exposure with `.meta()` {#gql-meta}

GraphQL-specific options are written with the `.meta()` method of [drizzle-metadata](https://www.npmjs.com/package/drizzle-metadata), right next to the table or column definition. `.meta()` returns the table or column as is. Neither its Drizzle type nor its behavior changes.

Import two modules at the top of the schema file. `drizzle-metadata/register` adds `.meta()` to Drizzle tables and columns, and `@zeltjs/graphql-drizzle/metadata` adds the keys below to the type of `.meta()`. Import them in the schema file itself rather than in the app entry, because generation loads only the schema module.

| Target | Metadata | Meaning |
| --- | --- | --- |
| Table | `graphqlName: 'User'` | GraphQL type name. Defaults to the export name in PascalCase (`users` → `Users`) |
| Table | `graphqlHidden: true` | No model is generated. Relations to this table are not generated either |
| Column | `graphqlHidden: true` | Not exposed in GraphQL. Resolvers can refer to it by a `$`-prefixed name (see below) |

Other libraries built on drizzle-metadata add their own keys to the same `.meta()`. A later `.meta()` call replaces an earlier one on the same table or column, so write all keys in one call.

This example uses brand types for IDs and foreign keys, but brand types are not required. When you use them, specify them with Drizzle's `$type<>()`, and the type carries over to the generated model type unchanged ([Primary Keys and IDs](#primary-key)).

Tables without `graphqlHidden` are exposed. When you add a new table or column to the DB, it appears in GraphQL on the next build. Mark anything you do not want to expose with `graphqlHidden`.

## What Gets Generated {#generated}

The schema above generates the following code (excerpt).

```ts
// @filename: graphql-drizzle/src/generated/drizzle-graphql.ts
import type { ID } from '@zeltjs/graphql';
import { users, posts } from '../db/schema';
// ---cut---
// src/generated/drizzle-graphql.ts (generated; do not edit)
type $usersRow = typeof users.$inferSelect;
type $postsRow = typeof posts.$inferSelect;

export interface User {
  readonly id: ID<$usersRow['id']>;
  readonly firstName: $usersRow['firstName'];
  readonly lastName: $usersRow['lastName'];
  readonly $passwordHash: $usersRow['passwordHash'];
  readonly posts: readonly Post[];
}

export interface Post {
  readonly id: ID<$postsRow['id']>;
  readonly title: $postsRow['title'];
  readonly authorId: $postsRow['authorId'];
  readonly $createdAt: $postsRow['createdAt'];
  readonly author: User;
}

export abstract class GeneratedUserResolver { /* resolves columns and relations */ }
export abstract class GeneratedPostResolver { /* resolves columns and relations */ }
```

- **Model types**: Each column becomes a property named after its key, and its type refers directly to the type Drizzle infers (`$inferSelect`). `graphqlHidden` columns get a `$`-prefixed name and, per the [GraphQL conventions](./graphql.md#code-first), do not appear in the schema.
- **Relations**: Each becomes a property named after its key in `relations()`. Relations to `graphqlHidden` tables (`sessions` in the example above) are not generated.
- **`GeneratedXxxResolver`**: An abstract class with a `@ResolveMultiField` that fetches column values for IDs in batches and a `@Relation` for each relation.

### Primary Keys and IDs {#primary-key}

The single-column primary key becomes the model's `id`. The primary key column can have any name, but its type must be a string (see below for why).

| | Type |
| --- | --- |
| TypeScript (`User['id']`) | The primary key's type itself. `UserId` in the example above, and `Post['id']` is `PostId`. `string` without `$type<>()` |
| GraphQL | `ID!` |

`ID<T>` marks `T` as "exposed as `ID` in GraphQL", and the value is still handled as `T`. A `UserId` value can be assigned to `User['id']` as is, and `User['id']` can be used as a `UserId`.

GraphQL IDs are assumed to be unique across all models. Use primary keys that do not collide even across tables, such as UUID strings. Integer primary keys that number rows per table cannot satisfy this assumption, so they cannot be exposed (a generation-time error).

The GraphQL type stays `ID` and is not turned into a custom scalar like `UserId`, because client caches and code generators assume `ID`.

The GraphQL schema obtained from this schema is:

```graphql
type User {
  id: ID!
  firstName: String!
  lastName: String!
  posts: [Post!]!
}

type Post {
  id: ID!
  title: String!
  authorId: String!
  author: User!
}
```

The `Query` type contains only the `@Query` methods you write.

## Writing Resolvers {#resolver}

For each exposed model, provide **exactly one** resolver that extends the generated abstract class, and register it with `graphql()`. Write Queries and computed fields in this file as usual. What a model exposes can be traced from this file (the added field declarations and the resolver) and its base class.

```ts
// @filename: graphql-drizzle/src/graphql/user.resolver.ts
// ---cut---
// src/graphql/user.resolver.ts
import { inject } from '@zeltjs/core';
import { args, Query, ResolveField, Resolver } from '@zeltjs/graphql';
import { eq } from 'drizzle-orm';
import * as v from 'valibot';
import { DrizzleService } from '../db/drizzle.service';
import { UserId, users } from '../db/schema';
import { GeneratedUserResolver, type User } from '../generated/drizzle-graphql';

export const GetUserInput = v.object({ id: UserId });

declare module '../generated/drizzle-graphql' {
  interface User {
    readonly displayName: string;
  }
}

@Resolver()
export class UserResolver extends GeneratedUserResolver {
  constructor(private db = inject(DrizzleService)) {
    super();
  }

  @Query()
  async user(input = args(GetUserInput)): Promise<Pick<User, 'id'> | null> {
    const [row] = await this.db.client
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.id));
    return row ?? null;
  }

  @ResolveField()
  displayName(user: Pick<User, 'firstName' | 'lastName'>): string {
    return `${user.firstName} ${user.lastName}`;
  }
}
```

```ts
// @filename: graphql-drizzle/src/graphql/post.resolver.ts
// ---cut---
// src/graphql/post.resolver.ts
import { Resolver } from '@zeltjs/graphql';
import { GeneratedPostResolver } from '../generated/drizzle-graphql';

@Resolver()
export class PostResolver extends GeneratedPostResolver {}
```

```ts
// @filename: graphql-drizzle/src/app.ts
import { graphql } from '@zeltjs/graphql';
import { UserResolver } from './graphql/user.resolver';
import { PostResolver } from './graphql/post.resolver';
// ---cut---
// src/app.ts
graphql({
  path: '/graphql',
  resolvers: [UserResolver, PostResolver],
});
```

### Queries Return Only IDs of Existing Rows {#query-existence}

Per the [GraphQL contract](./graphql.md#runtime-contract), an ID returned by a Query means "that row exists". Do not return an ID received from the client as is; check that it exists in the DB first, as in the example above. Returning an ID that does not exist causes a GraphQL error when its columns are fetched.

IDs from clients are strings for every primary key. Convert and validate them to the primary key's type with the `args()` validator. In the example above, the `UserId` schema validates that the value is a UUID and brands it.

### Adding Fields {#add-field}

To add a field to a generated model, do as with [GraphQL models](./graphql.md#code-first): declare it in the model type and resolve it with `@ResolveField`. The generated file cannot be edited, so declare it from the resolver's file by adding it to the generated `interface` with `declare module` (TypeScript declaration merging). The example above adds `User.displayName: String!`.

An added field becomes part of the model type, so it can be a dependency of another `@ResolveField` and can be referenced from related models (the target of `Post.author`). Declare the fields a computation needs with `Pick<User, ...>` in the `@ResolveField` parameter. `graphqlHidden` columns can also be referenced by their `$`-prefixed names.

```ts
// @filename: graphql-drizzle/src/graphql/user.resolver.ts
import { Resolver, ResolveField } from '@zeltjs/graphql';
import { GeneratedUserResolver, type User } from '../generated/drizzle-graphql';
// ---cut---
declare module '../generated/drizzle-graphql' {
  interface User {
    readonly displayName: string;
    readonly initials: string;
    readonly hasPassword: boolean;
  }
}

@Resolver()
export class UserResolver extends GeneratedUserResolver {
  @ResolveField()
  displayName(user: Pick<User, 'firstName' | 'lastName'>): string {
    return `${user.firstName} ${user.lastName}`;
  }

  @ResolveField()
  initials(user: Pick<User, 'displayName'>): string {
    return user.displayName
      .split(' ')
      .map((part) => part.charAt(0))
      .join('');
  }

  @ResolveField()
  hasPassword(user: Pick<User, '$passwordHash'>): boolean {
    return user.$passwordHash.length > 0;
  }
}
```

A declared field without a `@ResolveField`, or a `@ResolveField` without a matching declaration, is a build error, per the [GraphQL contract](./graphql.md#runtime-contract).

### Exposing a Column in a Different Form {#replace-field}

To expose a transformed column value, make the column `graphqlHidden`, declare a field with the same name, and resolve it with `@ResolveField`. `posts.createdAt` in the schema above is an example.

```ts
// @filename: graphql-drizzle/src/graphql/post.resolver.ts
import { Resolver, ResolveField } from '@zeltjs/graphql';
import { GeneratedPostResolver, type Post } from '../generated/drizzle-graphql';
// ---cut---
declare module '../generated/drizzle-graphql' {
  interface Post {
    readonly createdAt: string;
  }
}

@Resolver()
export class PostResolver extends GeneratedPostResolver {
  @ResolveField()
  createdAt(post: Pick<Post, '$createdAt'>): string {
    return post.$createdAt.toISOString();
  }
}
```

You cannot add a field with the same name as a column that is not `graphqlHidden`. If the types differ, it is a TypeScript type error; if the types are the same, the duplicate source is a build error. No implicit override happens.

## Column Types {#column-types}

A column can be exposed when the TypeScript type Drizzle infers for it is one of the following.

| TypeScript type | GraphQL type |
| --- | --- |
| `string` | `String` |
| `number` | `Float` |
| `boolean` | `Boolean` |
| An array of the above | `[T!]` |
| The above `\| null` (without `notNull()`) | nullable |

A `string` / `number` branded with `$type<>()` (such as `UserId`) is exposed as its underlying type.

Exposing a column of any other type (`Date`, `bigint`, JSON, a union of string literals, and so on) is a build error. Make it `graphqlHidden` and [expose it in a different form](#replace-field).

## Relations {#relations}

| Drizzle definition | Model property | GraphQL |
| --- | --- | --- |
| `many(posts)` | `readonly Post[]` | `[Post!]!` |
| `one(users, …)`, all `fields` are `notNull()` | `User` | `User!` |
| `one(users, …)`, `fields` include a nullable column | `User \| null` | `User` |
| `one(users)` (reverse `one` without `fields`) | `User \| null` | `User` |

- `many` returns targets in ascending order of their primary key. With no targets, it is an empty array.
- `one` whose `fields` are all `notNull()` assumes the target always exists. Keep referential integrity with foreign key constraints. A row whose target does not exist causes a GraphQL error.
- Relations are fetched by grouping the parents within the same GraphQL operation, with one query per relation. Columns are also fetched with one query per model, grouping the IDs.
- Relations cannot take arguments (limit, ordering, filtering). If you need them, remove the relation from `relations()` and write the `@Relation` yourself.

## When the Schema Changes {#schema-changes}

| Change | Result on the next build |
| --- | --- |
| Add a column, table, or relation | Added to GraphQL (except those marked `graphqlHidden`) |
| Remove or rename a column | Removed from GraphQL. `Pick`s and resolvers that depend on the column are type errors |
| Change a column's type | The model type changes. Resolvers that no longer fit are type errors |
| Add `graphqlHidden` | Removed from GraphQL and renamed with a `$` prefix. Resolvers that depend on the original name are type errors |
| Make a table `graphqlHidden` | The model and the relations to it are removed. Resolvers extending it are errors |

This package does not detect how GraphQL schema changes (such as removed fields) affect clients.

## Build-Time Errors {#build-errors}

In the following cases, `zelt build` / `zelt dev` fails at the generation or analysis stage.

- An exposed table has no single-column primary key (a composite key or no primary key)
- An exposed table's primary key is not a string type (an integer, for example)
- An exposed table's primary-key column is marked `graphqlHidden: true`
- An exposed table has a column keyed `id` other than its primary key
- An exposed column's type is not in the [type table](#column-types)
- An exposed table is not a PostgreSQL or SQLite table (MySQL, for example)
- A column and a relation share a key name, or the key of a relation or of a column that is neither the primary key nor `graphqlHidden` is not a valid GraphQL name (`full-name`, or a key starting with `$` or `__`, for example)
- Two tables have the same GraphQL type name
- A table's GraphQL type name is not a valid GraphQL name, is the same as a generated resolver name (`GeneratedXxxResolver`), or is a name GraphQL or TypeScript reserves (`ID`, `String`, `Query`, `string`, `class`, and so on)
- No resolver extending an exposed model is registered with `graphql()`, or two or more are registered
- An added field has the same name as a column or relation that is not `graphqlHidden`
- An added field's declaration and its `@ResolveField` do not match

## Current Scope {#limitations}

- Many-to-many relations cannot be expressed directly. Expose the join table and traverse two relations (the join table also needs a single-column primary key).
- MySQL is not supported.
- Only reads are generated. Write mutations as ordinary `@Mutation` methods.
