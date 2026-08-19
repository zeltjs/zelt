# Changelog

## Unreleased

### Breaking Changes

- Build-time GraphQL APIs now belong to `@zeltjs/graphql/codegen`. Update root
  imports of `graphqlPlugin`, SDL/runtime generators, schema-first generators,
  metadata inspection, and GraphQL type conversion helpers to the codegen
  subpath.
- `graphql()` no longer accepts `runtime`, `runtimeLoader`, or `runtimeModule`.
  It only takes `path` and `resolvers`; the generated runtime is delivered
  through the adapter's new `prebuilt` option instead (see Features below).
  `GraphqlPluginOptions.outDir` and other output-path options are removed —
  `graphqlPlugin()` always writes to `.zelt/graphql/` under the project root.

### Features

- `graphqlPlugin()` (from `@zeltjs/graphql/codegen`) now contributes a
  `PrebuiltContribution` per GraphQL endpoint so `zelt build`/`zelt dev` can
  assemble `.zelt/prebuilt.ts`. Each endpoint's generated runtime carries a
  `resolversHash` fingerprint, verified against the live resolver set at
  startup via the new `computeGraphqlPrebuiltHash()` export.
- New exported type `GraphqlPrebuiltEntry` describes a single endpoint's
  prebuilt entry (`{ runtime, resolversHash }`).
