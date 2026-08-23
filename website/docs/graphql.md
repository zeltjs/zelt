---
sidebar_label: GraphQL
---

# GraphQL

`@zeltjs/graphql` is experimental. The runtime manifest shape and generated
helper APIs may change before stable release.

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

Supported experimental app-authoring APIs:

- `graphql()`
- `Resolver`
- `Query`
- `Mutation`
- `ResolveField`
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

## Code-first

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
its embedded `resolversHash` — a SHA-256 fingerprint over the endpoint path
and the sorted resolver class names — is checked against the value recomputed
from the running `graphql({ path, resolvers })` declaration. A mismatch means
the prebuilt entry is stale relative to the current resolvers, and startup
throws telling you to rerun `zelt build`. v1 only fingerprints the endpoint
path and resolver class names — changes to resolver method signatures,
argument types, or return types are not detected and still require rerunning
`zelt build` manually.

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
