---
sidebar_label: GraphQL
---

# GraphQL

A User model is not owned by a Query. `Query.user`, search results, and `Post.author` are entry points to the same User. Every entry uses the same data provider and computed fields.

## Four responsibilities {#responsibilities}

| Definition | Input → output | Responsibility |
| --- | --- | --- |
| `@Query` | Arguments and execution context → model references | Choose subjects at the root |
| `@Relation` | Required parent data → target references | Choose related subjects, including filters such as publication status |
| `@ResolveMultiField` | References → source data | Supply data for IDs |
| `@ResolveField` | Required source data → value | Compute a field |

Query and Relation have the same responsibility: select and return model references. Query starts from root arguments and execution context; Relation starts from parent data. Both may query a database to filter subjects, but the provider supplies their actual data. An existing `$authorId` can produce a reference without I/O; public-post selection can search for matching IDs.

The goal is to avoid fetching once per parent. Additional queries across models and loading stages are allowed; a single SQL statement is not guaranteed.

## Define models {#models}

Models are ordinary named TypeScript types. The initial identity contract is a required, non-null `id: string`. Composite keys and numeric IDs are outside the initial scope.

```ts no-check
export type User = {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly $familyNameFirst: boolean;
};

export type Post = {
  readonly id: string;
  readonly title: string;
  readonly $authorId: User['id'];
};
```

Keep each model's data in one type, `User` or `Post`. Properties starting with `$` are private to GraphQL; other source properties become public fields. Providers return this model type, and computed fields and relations use `Pick` of the same type. Separate public/private types are unnecessary.

`$familyNameFirst` determines name ordering; `$authorId` identifies an author. The generator excludes `$`-prefixed properties from SDL, so clients cannot select them and GraphQL responses do not contain them. It does not expose them under names with the prefix removed. They remain ordinary TypeScript keys, accessible with `Pick` and dot notation.

This convention controls GraphQL exposure; it is not a JavaScript private field. Ordinary object access and `JSON.stringify` still include these values. The convention does not protect another HTTP API returning the object directly. Name private model data with the prefix, for example `$passwordHash`.

Do not repeat relations or computed fields in these types. The generator adds those definitions to the GraphQL model. `Pick<User, 'id'>` is a reference to a User, not an already loaded User.

## Supply User data, compute fields, and select relations {#user-resolver}

The example assumes an existing application `DrizzleService.client` and Drizzle `users` / `posts` tables. Selected result keys match the model types. `users.familyNameFirst` is a private boolean for computation; `posts.published` is a private boolean for filtering. Add application-specific authorization conditions in providers and search services.

```ts no-check
import { inject } from '@zeltjs/core';
import {
  args, Query, Relation, ResolveField, ResolveMultiField, Resolver,
} from '@zeltjs/graphql';
import { and, asc, eq, inArray } from 'drizzle-orm';
import * as v from 'valibot';
import { DrizzleService } from './db/drizzle.service';
import { posts, users } from './db/schema';
import type { Post, User } from './models';

export const GetUserInput = v.object({ id: v.string() });
export const GetUsersInput = v.object({ ids: v.array(v.string()) });

@Resolver()
export class UserResolver {
  constructor(private db = inject(DrizzleService)) {}

  @Query()
  user(input = args(GetUserInput)): Pick<User, 'id'> {
    return { id: input.id };
  }

  @Query()
  users(input = args(GetUsersInput)): readonly Pick<User, 'id'>[] {
    return input.ids.map(id => ({ id }));
  }

  @ResolveMultiField()
  async dbValues(
    refs: readonly Pick<User, 'id'>[],
  ): Promise<ReadonlyMap<User['id'], User | null>> {
    const rows = await this.db.client
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        $familyNameFirst: users.familyNameFirst,
      })
      .from(users)
      .where(inArray(users.id, refs.map(ref => ref.id)));

    const byId = new Map(rows.map(row => [row.id, row]));
    return new Map(refs.map(ref => [ref.id, byId.get(ref.id) ?? null]));
  }

  @ResolveField()
  name(
    user: Pick<User, 'firstName' | 'lastName' | '$familyNameFirst'>,
  ): string {
    return user.$familyNameFirst
      ? user.lastName + ' ' + user.firstName
      : user.firstName + ' ' + user.lastName;
  }

  @Relation()
  async publicPosts(
    parents: readonly Pick<User, 'id'>[],
  ): Promise<ReadonlyMap<User['id'], readonly Pick<Post, 'id'>[]>> {
    const rows = await this.db.client
      .select({ id: posts.id, authorId: posts.authorId })
      .from(posts)
      .where(and(
        inArray(posts.authorId, parents.map(parent => parent.id)),
        eq(posts.published, true),
      ))
      .orderBy(asc(posts.id));

    return new Map(parents.map(parent => [
      parent.id,
      rows
        .filter(row => row.authorId === parent.id)
        .map(row => ({ id: row.id })),
    ]));
  }
}
```

A `@Resolver()` class with one `@ResolveMultiField()` is a model provider. Its first parameter's `Pick<User, 'id'>` establishes the parent model, and its result uses the same `User` type, including `$` properties. No mode option is needed. The class has one fixed parent model, and an endpoint cannot register multiple providers for that model.

The method name `dbValues` is not a GraphQL field. Non-`$` properties of `User` become public fields; `name` adds a computed field and `publicPosts` adds a relation.

`Pick` declares the parent data a method needs. `name` can read the private `$familyNameFirst` but cannot access `user.id`. `publicPosts` uses parent IDs to select public Post references. The query's `authorId` groups results by parent; it is not stored as hydrated Post data.

## Navigate from Post back to User {#post-resolver}

```ts no-check
import { inject } from '@zeltjs/core';
import { Relation, ResolveMultiField, Resolver } from '@zeltjs/graphql';
import { inArray } from 'drizzle-orm';
import { DrizzleService } from './db/drizzle.service';
import { posts } from './db/schema';
import type { Post, User } from './models';

@Resolver()
export class PostResolver {
  constructor(private db = inject(DrizzleService)) {}

  @ResolveMultiField()
  async dbValues(
    refs: readonly Pick<Post, 'id'>[],
  ): Promise<ReadonlyMap<Post['id'], Post | null>> {
    const rows = await this.db.client
      .select({
        id: posts.id,
        $authorId: posts.authorId,
        title: posts.title,
      })
      .from(posts)
      .where(inArray(posts.id, refs.map(ref => ref.id)));

    const byId = new Map(rows.map(row => [row.id, row]));
    return new Map(refs.map(ref => [ref.id, byId.get(ref.id) ?? null]));
  }

  @Relation()
  author(post: Pick<Post, '$authorId'>): Pick<User, 'id'> {
    return { id: post.$authorId };
  }
}
```

`author` converts the private `Post.$authorId` to a User reference. This example has a non-null author ID and requires an author, so it returns `Pick<User, 'id'>`, producing `author: User!`. It neither loads User data nor computes a name.

For an optional author, make the internal `$authorId` nullable and return `Pick<User, 'id'> | null`, explicitly handling the absent relation. Nullability expresses the public model's meaning; it is not added universally to accommodate acquisition failures. A missing or inaccessible target on a non-null relation is a GraphQL error.

The parent parameter determines batching. A method accepting `Pick<T, ...>`, such as `author`, runs per parent. A method accepting `readonly Pick<T, ...>[]`, such as `publicPosts`, receives a batch of parents. There is no batch decorator option.

Synchronous/asynchronous execution and single/batch execution are independent. Both forms may return a value or a Promise, and both may access a database. A single-parent method that queries for each parent can cause N+1. Use the array form to batch I/O across parents; marking a method async does not batch it.

## Entry points and generated schema {#entry-points}

Register both classes through the existing endpoint declaration.

```ts no-check
graphql({
  path: '/graphql',
  resolvers: [UserResolver, PostResolver],
})
```

Write each public root field as a `@Query` method. The method name supplies its public name, `args(schema)` supplies arguments, and the return type supplies the target model, cardinality, and nullability. The generator emits schema and bindings from these declarations. There is no configuration that generates Query methods or chooses root names. The example produces:

```graphql
type Query {
  user(id: String!): User!
  users(ids: [String!]!): [User!]!
}

type User {
  id: ID!
  firstName: String!
  lastName: String!
  name: String!
  publicPosts: [Post!]!
}

type Post {
  id: ID!
  title: String!
  author: User!
}
```

This `users` method returns references for supplied IDs, not an unrestricted list. Preserve input order and duplicates; an empty result does not invoke the provider. The example's `user` and `users` elements are non-null, so a provider result of null produces a GraphQL error. To treat absence as a normal null response, declare `Pick<User, 'id'> | null`, or `readonly (Pick<User, 'id'> | null)[]` for nullable list elements.

The input schemas use `v.string()`, so the example arguments are `String!` / `[String!]!`. The model's identity field is `ID!`.

`User` is the same GraphQL type at the root and under `Post.author`. Do not derive a separate `PostAuthor` type from its path. Resolve the TypeScript declaration to identify each model within an endpoint; different models colliding on a GraphQL type name are build errors.

Filtered searches use the same `@Query` mechanism: select subjects and return references rather than source-data objects.

```ts no-check
import { args, Query } from '@zeltjs/graphql';
import * as v from 'valibot';

export const SearchUsersInput = v.object({
  prefix: v.string(),
  limit: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
});

// Method inside UserResolver; userSearch is an injected application service.
@Query()
async searchUsers(
  input = args(SearchUsersInput),
): Promise<readonly Pick<User, 'id'>[]> {
  return this.userSearch.findVisibleUserRefs(input);
}
```

This method belongs inside `UserResolver`. `userSearch` is an application service responsible for search, ordering, limits, and search authorization. The generated field is `searchUsers(...): [User!]!`. Define entries for another parent model in that model's resolver.

Duplicate Query field names are build errors. Both ID lookup and search use the common provider to confirm target existence and visibility, just as a Relation does.

## Execute a nested request {#execution}

```graphql
query {
  users(ids: ["u1", "u2"]) {
    name
    publicPosts {
      title
      author {
        name
      }
    }
  }
}
```

1. The entry creates User references and calls the User provider in a batch.
2. Compute `name` after its dependencies are available. Collect parents for one `publicPosts` batch search.
3. Collect the returned Post IDs and load source data through the Post provider.
4. `Post.author` converts each `$authorId` to a User reference.
5. Reuse already loaded authors; batch only missing User IDs through the User provider.
6. Compute each author's `name` and return only client-selected fields.

The example Query only constructs references, so it performs no ID-search query. The initial User load, public-post ID search, and Post load require three database accesses. Authors already present among the initial users need no additional load; other authors require a subsequent batch. These counts assume no batch-size splitting or additional application I/O.

A filtered Query or Relation can require two database accesses: searching for matching IDs and loading data for those IDs. If every loading stage needs a search, the cost is roughly two accesses per root/nesting stage. This is an accepted cost of separating subject selection from data supply. ID lookups, parent foreign keys, and reused data can eliminate steps, so nesting depth multiplied by two is not a universal count.

`publicPosts` is a GraphQL list. An expression such as `user.publicPosts[1].author.name` indexes the response on the client; the GraphQL selection applies to each returned list element.

Unselected relations and computed fields do not execute. Determine effective selections using fragments, variables, aliases, and `@skip` / `@include`. Do not execute children of a null parent.

## Batching, reuse, and failures {#runtime-contract}

- **Provider input:** A non-empty array of deduplicated, unloaded IDs for the same endpoint, model, and execution context. A single parent still uses an array.
- **Batch boundary:** Collect requests that become resolvable in the same loading stage. This does not promise one call per operation: deeper selections may reveal IDs in later stages. Cross-model query fusion is not guaranteed.
- **Provider output:** Map every input ID to complete internal data, including private fields, or explicit null. Map order is irrelevant. Missing keys, extra keys, and values whose `id` disagrees with the key violate the contract.
- **Batch relation output:** Map every parent ID to its reference or reference list. No match for a nullable single target yields null; no matches for a list yield an empty array. An absent required target is an error. Preserve list order and duplicates. Never omit a parent key.
- **Reuse scope:** Cache source data and missing results only within one GraphQL operation. Key by model and ID, not ID alone. Never share across requests, endpoints, or authorization contexts.
- **Existence and authorization:** Even an `{ id }` selection must check existence and visibility through the provider rather than serialize an unchecked reference. Model visibility is consistent across entry paths within an operation; relation-specific publication filters select references separately.
- **Errors:** Do not turn acquisition failures into null or empty lists. Exceptions become GraphQL errors at affected fields and propagate according to schema nullability. A null target on a non-null relation or search-result element also follows GraphQL error propagation.
- **I/O responsibility:** The framework batches providers and array-parameter relations. Single-parameter relations run per parent regardless of whether they are synchronous or asynchronous. Application code that runs one SQL statement per item inside a batch function still creates N+1. Implement actual batching, such as an `IN` query.

Relations and computed fields have no GraphQL arguments in the initial version. Root Query methods handle search arguments. Per-parent pagination and argument-bearing relations are later extensions; unrelated conditions must not be silently merged into a batch.

Cycles in model relations, such as User → Post → User, are allowed: execution follows the finite client selection. This does not enable dependencies between computed fields. Mutations that modify model data and invalidate operation-local provider results are outside this initial contract; do not enable model-mode mutation entry points until that contract is defined.

## Type and dependency checks {#type-contract}

TypeScript checks `Pick` keys and accesses inside method bodies. The generator checks contracts between methods that ordinary TypeScript checking cannot establish.

- The provider establishes the parent model and returns that model type, including `$` properties. Computed fields and relations declare dependencies using `Pick` of the same model type.
- Dependencies are source properties of the model, including private `$` properties. Depending on another computed field or a relation result is a build error.
- Query and single-parent relation results are a registered model's `Pick<T, 'id'>`, a list of those references, or nullable forms. For batch relations, each Map value has that same result shape. Unwrap Promise before interpreting either form. Return declarations containing the full model or extra fields are rejected. Structural typing cannot exclude all extra runtime properties, so the runtime consumes only IDs from references.
- Single-parent relations use a direct `Pick<T, ...>`; batch relations use its readonly array form. Custom generic wrappers and aliases around `Pick` are initially unsupported and produce diagnostics.
- `$`-prefixed source properties do not enter the schema. Public source fields, relations, and computed fields cannot duplicate a public name. Identity remains the public `id`; it cannot be replaced with `$id`.
- The `$` convention applies to model source data. Public Query, Relation, and ResolveField names must satisfy GraphQL naming rules; invalid public names, including `$` prefixes, are build errors.
- Initial public source properties support built-in scalars and their nullable/list forms. Add private properties for computation or reference selection to the same type using `$` prefixes. Model connections must be declared as relations.
- Computed fields are synchronous, pure calculations with the same initial scalar output range. They do not independently perform I/O or load dependencies.

Map completeness, database response completeness, and I/O behavior cannot be guaranteed by TypeScript alone. Generated boundary checks and implementation contracts cover these obligations. Casting a partial row with `as User` does not satisfy the model-data contract.

## Column selection and the selector boundary {#selection}

Providers return a fixed model-data shape, including `$` properties, in this initial contract. Requesting only `name` still makes the User provider return `id`, `firstName`, `lastName`, and private `$familyNameFirst`. The selector determines needed relations, computations, and their dependencies; it does not dynamically narrow database columns. Loading internal data does not expand the public schema.

Providers must return data consistent with their static return type; a dynamic database projection must not masquerade as a complete object. Translating dependency-expanded selections into Drizzle `columns` / `with` is deferred together with a sound partial-result contract. Cross-model single-SQL execution is also outside the initial guarantee.

## Schema-first and private properties {#private-schema-first}

SDL describes public fields only. `$` cannot appear in GraphQL field names, so private properties are neither written in SDL nor generated from SDL alone. Schema-first applications still need a TypeScript declaration for internal data. A public schema and the parent data passed to a resolver need not have identical shapes.

The `$` convention does not conflict with schema-first names. However, schema-first support for model providers and reference resolution remains outside the initial scope, as described below.

## Resolver modes {#compatibility}

Model providers and reference resolution support code-first only. A `@Resolver()` class containing `@ResolveMultiField()` follows the model contract. A class without a provider remains a direct field resolver. There is no decorator option for switching modes. When both coexist in an endpoint, public type-name and root-field collisions are build errors. Schema-first model support is outside the initial scope.

The generator analyzes types, dependencies, reference targets, and bindings, then emits SDL and the prebuilt runtime. Application resolvers do not import their own generated artifacts. Entries supply prebuilt modules to adapters as today. Model types and dependencies are reanalyzed during generation. Startup checks the runtime declarations and the consistency of the generated manifest and SDL.

Capture authorization data and services using existing DI/context conventions. Batch invocation restores the originating execution context. In synchronous context mode, capture required values before awaiting.

## Contract summary {#decisions}

1. Initial model identity is `id: string`; the sole provider establishes its parent model.
2. Query and Relation select references. Define public Query fields as ordinary methods and generate their schema.
3. Array parent parameters select batch execution for relations, independently of async and I/O.
4. Providers and batch relations return Maps, distinguishing absence from contract violations.
5. Reuse internal data within an operation. Accept separate ID-search and data-load queries at each stage.
6. Keep one model type and exclude only `$`-prefixed source properties from GraphQL. Providers return fixed model-data shapes. Dynamic column projection and dependencies between computed fields are deferred.

## HTTP behavior {#http}

`graphql-http` handles HTTP, `graphql-js` validates and executes GraphQL,
and DataLoader batches loads within an operation. Zelt connects model
contracts and execution context to these libraries.

GET accepts queries; POST accepts queries and mutations. Send POST bodies
with `Content-Type: application/json`. With `Accept: application/graphql-response+json`,
GraphQL syntax and validation failures produce HTTP 400 while execution
results produce HTTP 200, including field execution errors. Under the
legacy `application/json` response format, GraphQL validation errors may
instead produce HTTP 200 as specified by the protocol.

Malformed JSON produces 400, GET mutations 405, unsupported Accept headers
406, and unsupported request Content-Type headers 415. Model batching does
not enable HTTP request batching: arrays of HTTP operations are not accepted.

## Endpoints and API {#api-boundary}

Application-authoring APIs:

- `graphql()`
- `Resolver`
- `Query`
- `Mutation`
- `ResolveField`
- `ResolveMultiField`
- `Relation`
- `args()`
- `gqlScalar()`
- `GqlOutput`

`graphql({ path, resolvers, schema? })` declares the endpoint. Whether the
endpoint is code-first or schema-first is decided per endpoint, by whether
`schema` is passed: omit it for code-first, or pass the `schema` export from
a `zelt graphql codegen`-generated helper for schema-first. Either way,
`graphql()` never references the generated runtime directly — that is
supplied separately, through the adapter's `prebuilt` option (see Build flow
below).

Each endpoint has an identity key: `graphql({ path, resolvers, name })` — an
optional `name`, defaulting to `'graphql'` when omitted, same convention as
`http()`'s `name` option. The key namespaces the endpoint's prebuilt entry and
generated filename. Mounting more than one `graphql()` requires a distinct
`name` per endpoint; two endpoints sharing a key is a build-time error. `name`
must match `/^[A-Za-z0-9_-]+$/` and cannot be a reserved Windows device name
(`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`9`, `LPT1`-`9`); `graphql()` throws
immediately for an invalid `name`. Any mix of endpoints — multiple
schema-first lines, multiple code-first lines, or both together — can
coexist in the same app; each line binds only its own schema (or
resolver-derived SDL) and resolvers.

Generated-code APIs are exported for schema-first helpers only:

- `readGraphqlArgs()`
- `validateGraphqlArgs()`

Build-time APIs such as `graphqlPlugin()`, `generateGraphqlSdl()`,
`generateSdlForResolvers()`, schema-first codegen, metadata inspection, and
type conversion are exported from `@zeltjs/graphql/codegen` only.

Runtime integration APIs used by adapters and framework internals — including
`createGraphqlExecutor()`, `executeGraphqlRequest()`, `GraphqlRuntimeManifest`,
`GeneratedGraphqlRuntime`, `GraphqlPrebuiltEntry`, and
`computeGraphqlPrebuiltHash()` — remain on `@zeltjs/graphql`. Application code
does not normally need them.

## Direct field resolvers {#code-first}

Use a `@Resolver()` class without `@ResolveMultiField()` when returning objects directly, without model references or providers. A Query in this form returns the response source object; a Query in a provider class returns references instead.

```ts no-check
import { createApp, http } from '@zeltjs/core';
import { args, graphql, Query, Resolver } from '@zeltjs/graphql';
import * as v from 'valibot';

const GetProductInput = v.object({
  id: v.string(),
});

type Product = {
  readonly id: string;
  readonly name: string;
};

@Resolver()
class ProductResolver {
  @Query()
  product(input = args(GetProductInput)): Product {
    return { id: input.id, name: 'Keyboard' };
  }
}

export const app = createApp([
  http({
    children: [
      graphql({
        path: '/graphql',
        resolvers: [ProductResolver],
      }),
    ],
  }),
]);
```

`args(schema)` defines GraphQL field arguments from a Standard Schema and
validates them at runtime.

## Schema-first

```graphql
type Query {
  product(id: ID!): Product
}

type Product {
  id: ID!
  name: String!
}
```

```bash
zelt graphql codegen --schema src/graphql/schema.graphql --out src/generated/graphql.ts
```

This writes `src/generated/graphql.ts` with a `Gql` namespace of typed helpers
and a `schema` export (`{ sdl }`) that identifies this schema. It also upserts
an entry into `<cwd>/.zelt/graphql-codegen.json`, pairing the schema's content
hash with this helper's path — `graphqlPlugin()` uses that pairing later to
find where to write resolverChecks for an endpoint (see Build flow below).

```ts no-check
import { Query, Resolver } from '@zeltjs/graphql';
import { Gql } from '../../generated/graphql';

@Resolver()
class ProductResolver {
  @Query()
  product(input = Gql.Query.product.args()): Gql.Query.product.Result {
    return { id: input.id, name: 'Keyboard' };
  }
}
```

Pass the helper's `schema` export to `graphql()` to bind this endpoint to it:

```ts no-check
import { createApp, http } from '@zeltjs/core';
import { graphql } from '@zeltjs/graphql';
import { schema } from './generated/graphql';
import { ProductResolver } from './graphql/product.resolver';

export const app = createApp([
  http({
    children: [
      graphql({
        path: '/graphql',
        resolvers: [ProductResolver],
        schema,
      }),
    ],
  }),
]);
```

Each schema-first `graphql()` endpoint is paired with its schema this way —
in application code, not through plugin configuration. Because the pairing
lives at the `graphql()` call site, an app can mount several schema-first
lines (or mix schema-first and code-first lines) side by side, each with its
own `name`:

```ts no-check
graphql({ name: 'storefront', path: '/graphql', resolvers: [...], schema: storefrontSchema }),
graphql({ name: 'admin', path: '/admin/graphql', resolvers: [...], schema: adminSchema }),
```

`storefrontSchema` and `adminSchema` come from two separate `zelt graphql
codegen` runs, each with its own `--out`. The two lines never share resolvers
or schema — a query sent to `/graphql` only sees the storefront schema's
fields, and a query sent to `/admin/graphql` only sees the admin schema's.

Additional runtime validation can be layered onto generated helpers:

```ts no-check
@Query()
product(input = Gql.Query.product.args(GetProductInput)): Gql.Query.product.Result {
  return { id: input.id, name: 'Keyboard' };
}
```

In schema-first mode, SDL remains the source of truth. A Standard Schema passed
to generated args helpers is treated as additional validation.

`args<T>()` is intentionally not part of the user-facing API. Schema-first types
should come from generated helpers, not handwritten generic arguments.

## Build flow

Only the platform entry file imports build-generated runtime output —
everything under `.zelt/`. The app definition never imports it, so building
an app for the first time never hits a chicken-and-egg problem there.
Schema-first apps do import generated code (the typed helpers `zelt graphql
codegen` writes to `src/generated/graphql.ts`), but codegen runs directly
from `schema.graphql` and doesn't require evaluating the app, so no
chicken-and-egg problem arises there either.

```ts no-check
import { graphqlPlugin } from '@zeltjs/graphql/codegen';
```

Register the plugin in `zelt.config.ts`:

```ts no-check
import { defineConfig } from '@zeltjs/cli';
import { graphqlPlugin } from '@zeltjs/graphql/codegen';

export default defineConfig({
  app: () => import('./src/app').then((m) => m.app),
  plugins: [graphqlPlugin()],
  build: { entry: './src/node.ts' },
  dev: { entry: './src/node.ts' },
});
```

`zelt build` and `zelt dev` then run two generation steps automatically:

1. Each registered `graphqlPlugin()` writes `.zelt/graphql/<key>.runtime.ts`
   (`export const graphqlPrebuilt = { runtime, resolversHash }`) and a sibling
   `.graphql` SDL file, one pair per `graphql({ path, resolvers })` endpoint.
   `<key>` is the endpoint's validated key (its `name`, or `graphql` when
   omitted; see above), so two `graphql()` endpoints only collide if they
   share a key — pass a distinct `name` to each to disambiguate.
2. The CLI collects every plugin's contributions and writes `.zelt/prebuilt.ts`
   (`export const zeltPrebuilt = {...} satisfies ZeltPrebuilt`), which re-exports each generated
   module under its key, namespaced under the `graphql` feature. This file is
   always generated, even when no plugin contributes anything.

The platform entry file statically imports `zeltPrebuilt` and passes it to the
adapter:

```ts no-check
import { onNode } from '@zeltjs/adapter-node';
import { app } from './app';
import { zeltPrebuilt } from '../.zelt/prebuilt';

const nodeApp = await onNode(app, { prebuilt: zeltPrebuilt });
```

Every adapter (`onNode`, `onBun`, `onCloudflareWorkers`, `onElectron`,
`onLambda`) accepts the same `prebuilt` option. Because the entry file uses
only a static `import`, this works unmodified under bundlers that require
static imports, such as the Cloudflare Workers `wrangler` bundle — there is no
filesystem fallback on any platform.

A single `graphqlPlugin()` handles every endpoint in the app — code-first,
schema-first, or a mix — because each endpoint carries its own line (see
API boundary above). There is no `mode` option to choose between them.

### Code-first

1. Write model providers, relations, and computed fields, or direct field resolvers.
2. Configure `graphql({ path, resolvers })`.
3. Add `graphqlPlugin()` to `plugins` in `zelt.config.ts`.
4. Run `zelt build` or `zelt dev`.
5. The platform entry file imports `zeltPrebuilt` from `../.zelt/prebuilt` and
   passes it to the adapter.

### Schema-first

1. Write `schema.graphql`.
2. Run `zelt graphql codegen --schema ... --out ...`.
3. Write resolvers using generated `Gql` helpers.
4. Configure `graphql({ path, resolvers, schema })`, passing the helper's
   `schema` export.
5. Add `graphqlPlugin()` to `plugins` in `zelt.config.ts` (same as code-first
   — no schema-first-specific options).
6. Run `zelt build` or `zelt dev`.
7. The platform entry file imports `zeltPrebuilt` from `../.zelt/prebuilt` and
   passes it to the adapter.

Repeat steps 1-4 with a different `--out` and a distinct `name` per endpoint
to add another schema-first line.

Automatic schema-first codegen during `zelt dev` is not part of this release
boundary. Run `zelt graphql codegen` explicitly whenever `schema.graphql`
changes, before `zelt build`/`zelt dev` — a missing or stale codegen manifest
entry (`<cwd>/.zelt/graphql-codegen.json`) fails the build with an error
telling you to rerun it.

Every schema-first endpoint automatically gets a type-check file asserting
each resolver method's return type is assignable to the corresponding
generated `Gql.Query`/`Gql.Mutation` result type. It is written next to the
codegen helper the endpoint's schema hashes to (`<helper>.resolver-checks.ts`,
or `<helper>.<name>.resolver-checks.ts` when two endpoints share a helper) —
there is no configuration for this; `graphqlPlugin()` discovers the pairing
through the codegen manifest.

## Supported scope and startup checks {#current-limitations}

GraphQL requires the prebuilt module. If it is missing, if the endpoint's
prebuilt entry is missing, or if the entry file does not import `zeltPrebuilt`,
the endpoint throws at startup — there is no silent fallback on any platform.

Each endpoint uses the prebuilt entry matching its key. Checks are split between build and startup:

- During `zelt build` / `zelt dev`, GraphQL generation refreshes the TypeScript inspection cache and reanalyzes model types, providers, dependencies, and reference targets before producing the manifest and SDL.
- At startup, missing prebuilt entries or mismatched endpoint paths, resolver names, GraphQL method names, decorator kinds, or exposed field names cause an error. The runtime also checks that generated model metadata and SDL agree, including source field types and reference cardinality/nullability.

TypeScript-only changes are erased from runtime JavaScript. Startup cannot detect such a change when the old manifest and SDL remain mutually consistent. Regenerate and rebuild the application after changing types or dependencies, and deploy the application with its matching prebuilt output. No additional type-fingerprint code transformation is required.

### Direct code-first resolvers {#code-first-2}

- Output type support is intentionally narrow.
- Complex GraphQL interfaces are limited.
- Code-first supports custom scalar codecs and named unions experimentally.
- Field names default to method names. Explicit names are supported through
  decorators where available.
- Field args use Standard Schema runtime validation and require a schema adapter
  for SDL generation.

### Schema-first

- Schema-first codegen currently supports built-in scalars, object types,
  `Query`, and `Mutation`.
- Custom scalars, enums, unions, interfaces, and input objects are intentionally
  limited or deferred.
- Schema-first support for custom scalar codecs and named unions is still
  limited and will be expanded separately.
- Root `Query` and `Mutation` fields must have resolver bindings.
- Object fields may rely on GraphQL default field resolution.
- Generated `Gql.Query.<field>.args()` helpers are the main schema-first args
  API.
- User-facing `args<T>()` is intentionally not supported.
