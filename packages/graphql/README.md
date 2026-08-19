# @zeltjs/graphql

`@zeltjs/graphql` is experimental.

The runtime manifest shape and generated helper APIs may change before stable
release. This package is safe to try in Zelt applications, but app code should
stay on the app-authoring APIs listed below.

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
- `args()`
- `gqlScalar()`
- `GqlOutput`

`graphql({ path, resolvers })` only declares the endpoint; it never references
generated output. The generated runtime is supplied separately, through the
adapter's `prebuilt` option (see Build flow below).

Each endpoint has an identity key: `graphql({ path, resolvers, name })` — an
optional `name`, defaulting to `'graphql'` when omitted, same convention as
`http()`'s `name` option. The key namespaces the endpoint's prebuilt entry and
generated filename. Mounting more than one `graphql()` requires a distinct
`name` per endpoint; two endpoints sharing a key is a build-time error.

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

Only the platform entry file imports generated output. The app definition is
always evaluable with zero generated files, so building an app for the first
time never hits a chicken-and-egg problem.

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
   `<key>` is the endpoint's sanitized key (its `name`, or `graphql` when
   omitted; see above), so two `graphql()` endpoints only collide if they
   share a key — pass a distinct `name` to each to disambiguate.
2. The CLI collects every plugin's contributions and writes `.zelt/prebuilt.ts`
   (`export const zeltPrebuilt: ZeltPrebuilt`), which re-exports each generated
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
4. Configure `graphql({ path, resolvers })`.
5. Add `graphqlPlugin({ mode: 'schema-first', schema: '...' })` to `plugins`
   in `zelt.config.ts`.
6. Run `zelt build` or `zelt dev`.
7. The platform entry file imports `zeltPrebuilt` from `../.zelt/prebuilt` and
   passes it to the adapter.

Automatic schema-first codegen during `zelt dev` is not part of this release
boundary. Use `zelt graphql codegen` explicitly for now.

Pass `resolverChecks: { out, gqlTypesImport }` to `graphqlPlugin()` in
schema-first mode to additionally generate a type-check file that asserts each
resolver method's return type is assignable to the corresponding generated
`Gql.Query`/`Gql.Mutation` result type.

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

## Non-goals for this boundary

- New GraphQL feature support.
- Schema-first custom scalar, union, interface, enum, or input object support.
- Dev/watch codegen automation.
- Standard JSON Schema or vendor adapter registry.
- Zod adapter.
