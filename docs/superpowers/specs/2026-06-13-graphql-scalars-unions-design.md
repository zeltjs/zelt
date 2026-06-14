# GraphQL Scalars and Named Object Unions Design

## Goal

Finish the next GraphQL code-first requirements slice by supporting:

- `gqlScalar` / `GqlOutput` output scalar codecs
- named object union output

Subscriptions and schema-first helper types are intentionally out of scope for this branch.

## User Experience

Users keep writing resolver classes and public DTO types. They do not write GraphQL object classes or field decorators.

Scalar example:

```ts
export const UnixMillis = gqlScalar<Date>('UnixMillis', {
  serialize: (value) => value.getTime(),
  parseValue: (value) => new Date(value),
});

type ProductPublic = {
  id: string;
  releasedAt: GqlOutput<typeof UnixMillis>;
};
```

Union example:

```ts
type SearchResult = ProductPublic | CategoryPublic;

@Query()
search(): readonly SearchResult[] {
  return this.catalog.search();
}
```

## Scalar Design

`gqlScalar(name, codec)` returns a runtime value that carries the GraphQL scalar name and serialize/parse hooks. `GqlOutput<typeof Scalar>` is a type marker used only by the generator to detect scalar output fields in TypeScript type metadata.

The SDL generator emits only scalars reached from the output type graph. The generated runtime module imports the scalar values it needs and records scalar bindings. At runtime, `createGraphqlExecutor` creates `GraphQLScalarType` instances and attaches them to the schema so resolver return values are serialized by the codec.

If a `GqlOutput<typeof Scalar>` marker is found but the scalar runtime value cannot be imported, generation fails with a build-time error.

## Union Design

Named object unions are supported when all non-nullish union members are named object-like output types. The SDL generator emits:

```graphql
union SearchResult = ProductPublic | CategoryPublic
```

and ensures each member object definition is also generated. Nullable unions remain nullable. Primitive mixed unions and anonymous object unions continue to fail at build time.

The generated runtime records union member metadata. Runtime type resolution does not require users to add `__typename`. It resolves by comparing the result object's fields against each union member's known field set. If exactly one member matches, that member name is returned. If none or multiple members match, GraphQL reports a runtime error.

## Integration Coverage

`integration/graphql-dogfooding` should include both features as user-facing examples:

- a scalar-backed DTO field exercised through a GraphQL query
- a named object union query exercised through GraphQL inline fragments

The integration harness must continue to pass through:

```bash
./integration/scripts/run-tests.sh dist graphql-dogfooding
```

## Testing

Use TDD for each behavior:

- scalar SDL generation
- scalar runtime serialization
- scalar import failure as build-time error
- named object union SDL generation
- named object union runtime resolution
- ambiguous or unsupported unions failing clearly
- dogfooding e2e for scalar and union queries
