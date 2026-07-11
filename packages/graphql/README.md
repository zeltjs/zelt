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
frontends that produce the same manifest.

```text
Code-first:
  Resolver code + args(schema)
    -> generated schema.graphql
    -> generated graphql-runtime.js
    -> /graphql runtime

Schema-first:
  schema.graphql
    -> zelt graphql codegen
    -> generated typed helpers
    -> resolver code
    -> generated graphql-runtime.js
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

`graphql()` creates an executable HTTP endpoint and requires `runtime`,
`runtimeLoader`, or the legacy `runtimeModule` loader. Prefer `runtimeLoader`
when the manifest is generated into a separate module.

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

Runtime integration APIs remain on `@zeltjs/graphql`:

- `createGraphqlExecutor()`
- `executeGraphqlRequest()`
- `GraphqlRuntimeManifest`
- `GeneratedGraphqlRuntime`

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
        runtimeLoader: () => import('./dist/graphql-runtime.js'),
        runtimeModule: './dist/graphql-runtime.js',
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

GraphQL endpoints require a generated runtime manifest. `runtimeModule` tells
the codegen plugin where to write it; `runtimeLoader` tells the runtime how to
load it without assuming a Node filesystem.

```ts
import { graphqlPlugin } from '@zeltjs/graphql/codegen';
```

### Code-first

1. Write resolvers.
2. Configure `graphql({ runtimeModule, runtimeLoader })`.
3. Run `zelt build` or `graphqlPlugin()`.
4. The plugin generates `graphql-runtime.js` and a sibling `.graphql` file.
5. The caller-supplied loader loads the generated module.

### Schema-first

1. Write `schema.graphql`.
2. Run `zelt graphql codegen --schema ... --out ...`.
3. Write resolvers using generated `Gql` helpers.
4. Configure `graphql({ runtimeModule, runtimeLoader })`.
5. Run `zelt build` or `graphqlPlugin({ mode: 'schema-first', ... })`.
6. The plugin generates `graphql-runtime.js` and a sibling `.graphql` file.
7. The caller-supplied loader loads the generated module.

## Migration from the root codegen exports

Move build-time imports to the codegen subpath:

```ts
// before
import { generateGraphqlSdl, graphqlPlugin } from '@zeltjs/graphql';

// after
import { generateGraphqlSdl, graphqlPlugin } from '@zeltjs/graphql/codegen';
```

For portable runtime loading, add `runtimeLoader`. A string-only
`runtimeModule` remains available for compatibility, but it is passed directly
to `import()` and is no longer resolved against `process.cwd()`.

Automatic schema-first codegen during `zelt dev` is not part of this release
boundary. Use `zelt graphql codegen` explicitly for now.

Pass `resolverChecks: { out, gqlTypesImport }` to `graphqlPlugin()` in
schema-first mode to additionally generate a type-check file that asserts each
resolver method's return type is assignable to the corresponding generated
`Gql.Query`/`Gql.Mutation` result type.

## Current limitations

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
