# Changelog

## Unreleased

### Breaking Changes

- Build-time GraphQL APIs now belong to `@zeltjs/graphql/codegen`. Update root
  imports of `graphqlPlugin`, SDL/runtime generators, schema-first generators,
  metadata inspection, and GraphQL type conversion helpers to the codegen
  subpath.
- `graphql()` no longer accepts `runtime`, `runtimeLoader`, or `runtimeModule`.
  It only takes `path`, `resolvers`, and the new `name` (see Features below);
  the generated runtime is delivered through the adapter's new `prebuilt`
  option instead. `GraphqlPluginOptions.outDir` and other output-path options
  are removed — `graphqlPlugin()` always writes to `.zelt/graphql/` under the
  project root.

### Features

- `graphql({ path, resolvers, name })` accepts an optional `name`, the same
  convention as `http()`'s `name` option, defaulting to `'graphql'` when
  omitted. `name` becomes the endpoint's identity key: it namespaces the
  generated filename (`.zelt/graphql/<key>.runtime.ts`) and the prebuilt
  contribution/lookup key. Mounting more than one `graphql()` requires a
  distinct `name` per endpoint — `graphqlPlugin()` now rejects two endpoints
  that share a key with an actionable error.
- `graphqlPlugin()` (from `@zeltjs/graphql/codegen`) now contributes a
  `PrebuiltContribution` per GraphQL endpoint so `zelt build`/`zelt dev` can
  assemble `.zelt/prebuilt.ts`. Each endpoint's generated runtime carries a
  `resolversHash` fingerprint, verified against the live resolver set at
  startup via the new `computeGraphqlPrebuiltHash()` export — this only
  detects staleness; the endpoint's `name`/key is what identifies it.
- New exported type `GraphqlPrebuiltEntry` describes a single endpoint's
  prebuilt entry (`{ runtime, resolversHash }`).
