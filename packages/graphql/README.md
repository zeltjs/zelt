# @zeltjs/graphql

`@zeltjs/graphql` is experimental.

The runtime manifest shape and generated helper APIs may change before stable
release. This package is safe to try in Zelt applications, but app code should
stay on the app-authoring APIs listed below.

## Requirements and GraphQL 17 migration

Install GraphQL 17 alongside this package:

```sh
pnpm add @zeltjs/graphql graphql@^17.1.0
```

`graphql` is a peer dependency so the application and executor share the same
GraphQL instance. When migrating from GraphQL 16, upgrade the application's
`graphql` dependency to 17 as well. Import custom validation rules and GraphQL
types from that shared package; do not pass rules from a separate GraphQL 16
installation. Mixed instances can break type recognition and validation,
including introspection restrictions.

## Runtime model

GraphQL support is built around a shared runtime manifest:

- `schemaSdl`
- resolver bindings
- runtime metadata such as enum, scalar, and union mappings

The executor consumes the runtime manifest. Code-first and schema-first are
frontends that produce the same manifest, which is delivered to the running
app as a prebuilt module rather than loaded by the app itself.

```text
Code-first:
  Resolver code + args(schema)
    -> zelt build / zelt dev
    -> .zelt/graphql/<key>.runtime.ts (graphqlPrebuilt) + sibling .graphql
    -> .zelt/prebuilt.ts (zeltPrebuilt)
    -> entry imports zeltPrebuilt -> adapter(app, { prebuilt })
    -> /graphql runtime

Schema-first:
  schema.graphql
    -> zelt graphql codegen
    -> generated typed helpers
    -> resolver code
    -> zelt build / zelt dev
    -> .zelt/graphql/<key>.runtime.ts (graphqlPrebuilt) + sibling .graphql
    -> .zelt/prebuilt.ts (zeltPrebuilt)
    -> entry imports zeltPrebuilt -> adapter(app, { prebuilt })
    -> /graphql runtime
```

## API boundary

### Supported experimental app-authoring APIs

Application code may use these APIs directly:

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
schema-first lines, multiple code-first lines, or both together — can coexist
in the same app; each line binds only its own schema (or resolver-derived
SDL) and resolvers.

Build-time APIs such as `graphqlPlugin()`, `generateGraphqlSdl()`, and
`generateSdlForResolvers()` are exported only from `@zeltjs/graphql/codegen`.

### Generated-code API

These exports are required for schema-first generated helpers. Application code
should not call them directly:

- `readGraphqlArgs()`
- `validateGraphqlArgs()`

Use `args(schema)` in code-first mode. Use generated helpers such as
`Gql.Query.product.args()` in schema-first mode.

### Advanced and internal-ish API

Runtime integration APIs used by adapters and framework internals remain on
`@zeltjs/graphql`:

- `createGraphqlExecutor()`
- `executeGraphqlRequest()`
- `GraphqlRuntimeManifest`
- `GeneratedGraphqlRuntime`
- `GraphqlPrebuiltEntry`
- `computeGraphqlPrebuiltHash()`

Generation, TypeScript inspection, GraphQL metadata getters, and type
conversion helpers are available from `@zeltjs/graphql/codegen`.

## Model IDs and field providers

GraphQL scalar names follow the declared TypeScript type. After upgrading,
`id: string` generates `String!` instead of the previously inferred `ID!`.
To keep `ID!`, import `ID` from `@zeltjs/graphql` and declare `id: ID`.
Regenerate prebuilt output and check client operations and schema compatibility
when migrating an existing endpoint.

Declare public fields and private resolution properties in a named model.
`@ResolveField()` and `@Relation()` resolve declared fields; `@ResolveMultiField()`
may supply several properties together. It is optional when fields need only the ID. Queries
and `@Relation()` methods return `Pick<Model, 'id'>`; the runtime
hydrates data for those IDs through an operation-local DataLoader. All three
method kinds use the same contract: a single parent returns its result,
and an array of parents returns a Map from parent ID to each result. Both
forms may return a value or a Promise for the whole result. Batch parent
Picks must include `id`. `@ResolveField()` may be async and may perform I/O,
just like a relation or provider. Single-parent I/O can cause N+1; choosing
that form is permitted and does not produce a build warning.

Properties beginning with `$` remain available to providers and dependent
methods but are excluded from the GraphQL schema. A provider returns the
model or a `Pick<Model, keys>` of its supplied properties (including `id`), directly for one ID
or in a Map keyed by the requested IDs for a batch. Missing targets are
explicit null values; malformed Maps are errors. Map values are results,
not individual Promises. The provider return type assigns its public fields to
that provider: returning `Model` assigns all public fields, while returning
`Pick<Model, keys>` assigns only those keys. A field must have exactly one
supplier, so exclude fields resolved by `@ResolveField()` or `@Relation()` from
the provider Pick; supplying the same field twice is a build error.
Single providers still cache by model and ID
within an operation, but distinct IDs invoke them individually.

Regenerate prebuilt output after upgrading: provider and computed-field
metadata now record their invocation mode, and computed metadata records
the per-parent result type. Incomplete older model metadata is rejected.

The [GraphQL guide](https://zeltjs.com/docs/graphql) defines the model contract,
nullability, batching behavior, and source examples. Legacy resolvers without
a provider retain their direct-value behavior. Model providers are code-first
only; dynamic column projection and computed-field dependencies are outside
this initial scope.

## HTTP transport and dependencies

GET executes queries; POST executes queries and mutations. `graphql-http`
handles request parsing, media-type negotiation, and protocol responses.
Clients should send `Content-Type: application/json` for POST and use
`Accept: application/graphql-response+json` to distinguish GraphQL request
errors from execution results by HTTP status. Model batching is internal
and does not enable arrays of GraphQL HTTP requests.

The implementation uses maintained, MIT-licensed libraries rather than
reimplementing their responsibilities:

- `graphql` 17.1.0: schema validation and GraphQL execution, including
  fragments, directives, and null propagation. See the
  [17.1.0 release](https://github.com/graphql/graphql-js/releases/tag/v17.1.0).
- `graphql-http` 1.23.1: GraphQL-over-HTTP processing. See its
  [releases](https://github.com/graphql/graphql-http/releases).
- `dataloader` 2.2.3: operation-local batching and caching. The release is
  older, but maintenance continued in
  [September 2026](https://github.com/graphql/dataloader/commit/65be452f5ffad3eede2d862dc26c96003fa87ef3).

These maintenance checks were performed on 2026-11-06. The runtime does not
require AsyncLocalStorage for batching: it captures Zelt's context and uses
an explicit portable scheduler. HTTP authentication, rate limits, and
application-specific resource limits remain application responsibilities.
Resolver error messages are returned by GraphQL; avoid including private
backend details in errors exposed by application resolvers.

## Code-first

Code-first resolvers use classes, decorators, and Standard Schema argument
definitions. The build step generates SDL and a runtime manifest.

```ts
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
validates them at runtime. SDL generation requires a schema adapter for the
Standard Schema implementation.

## Schema-first

Schema-first starts from SDL and generates typed helpers.

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

Resolvers use generated `Gql` helpers:

```ts
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

```ts
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

```ts
graphql({ name: 'storefront', path: '/graphql', resolvers: [...], schema: storefrontSchema }),
graphql({ name: 'admin', path: '/admin/graphql', resolvers: [...], schema: adminSchema }),
```

`storefrontSchema` and `adminSchema` come from two separate `zelt graphql
codegen` runs, each with its own `--out`. The two lines never share resolvers
or schema — a query sent to `/graphql` only sees the storefront schema's
fields, and a query sent to `/admin/graphql` only sees the admin schema's.

Additional runtime validation can be layered onto generated helpers:

```ts
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

```ts
import { graphqlPlugin } from '@zeltjs/graphql/codegen';
```

Register the plugin in `zelt.config.ts`:

```ts
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

```ts
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

1. Write resolvers.
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

## Current limitations

GraphQL requires the prebuilt module. If it is missing, if the endpoint's
prebuilt entry is missing, or if the entry file does not import `zeltPrebuilt`,
the endpoint throws at startup — there is no silent fallback on any platform.

Each endpoint is looked up in the prebuilt module by its key (the endpoint's
`name`, or `graphql` when omitted). If no entry exists under that key —
because the prebuilt is missing the endpoint, or it hasn't been built yet —
startup throws and tells you to rerun `zelt build`. Once an entry is found,
its embedded `resolversHash` — a SHA-256 fingerprint over the endpoint path,
resolver class names, and GraphQL method declarations — is checked against the value recomputed
from the running `graphql({ path, resolvers })` declaration. A mismatch means
the prebuilt entry is stale relative to the current resolvers, and startup
throws telling you to rerun `zelt build`. The fingerprint covers runtime decorator kinds, method names, and exposed
field names. Startup also checks the generated model metadata against the SDL.

GraphQL generation refreshes its TypeScript inspection cache at each build,
then reanalyzes types and dependencies. TypeScript-only argument, model, and
return-type changes are erased from JavaScript and cannot be detected at
startup if the old manifest and SDL remain mutually consistent. Regenerate
and rebuild after those changes, then deploy the matching app and prebuilt
together. This contract does not require an additional code transformation
to embed type fingerprints.

### Code-first

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

## Non-goals for this boundary

- New GraphQL feature support.
- Schema-first custom scalar, union, interface, enum, or input object support.
- Dev/watch codegen automation.
- Standard JSON Schema or vendor adapter registry.
- Zod adapter.
