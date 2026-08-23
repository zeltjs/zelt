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
- `graphqlPlugin()` no longer takes `mode`, `schema`, `resolverChecks`, or
  `gqlTypesImport`. Whether an endpoint is code-first or schema-first is now
  decided per `graphql()` call, by whether its new `schema` option is passed
  — not by plugin configuration. A single `graphqlPlugin()` handles every
  endpoint in the app regardless of line.
- `graphql()`'s `name` is now validated and must match
  `/^[A-Za-z0-9_-]+$/`; it also cannot be a reserved Windows device name
  (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`9`, `LPT1`-`9`). `graphql()` throws
  immediately for an invalid `name` instead of silently sanitizing it into a
  filename. Two endpoint names that only differ by case (e.g. `'Admin'` vs.
  `'admin'`) are now a build-time error, since their generated filenames
  would otherwise collide on case-insensitive filesystems.

### Features

- `graphql({ path, resolvers, name, schema })` accepts an optional `name`,
  the same convention as `http()`'s `name` option, defaulting to `'graphql'`
  when omitted. `name` becomes the endpoint's identity key: it namespaces the
  generated filename (`.zelt/graphql/<key>.runtime.ts`) and the prebuilt
  contribution/lookup key. Mounting more than one `graphql()` requires a
  distinct `name` per endpoint — `graphqlPlugin()` now rejects two endpoints
  that share a key with an actionable error.
- `graphql()` gains a `schema` option: a `GqlSchemaRef` (`{ sdl }`), typically
  the `schema` export from a `zelt graphql codegen`-generated helper. Passing
  it selects the schema-first line for that endpoint; omitting it selects
  code-first. Each endpoint's line — its schema (or resolver-derived SDL) and
  its resolvers — is independent, so an app can mount any mix of schema-first
  and code-first `graphql()` endpoints side by side.
- `zelt graphql codegen` now additionally writes a `schema` export
  (`{ sdl }`) alongside the generated `Gql` namespace, and upserts an entry
  into `<cwd>/.zelt/graphql-codegen.json` pairing the schema's content hash
  with the generated helper's path. `graphqlPlugin()` reads this manifest to
  find, for each schema-first endpoint, which helper its schema belongs to.
- Schema-first resolverChecks generation is now automatic and unconfigured:
  every schema-first endpoint gets a type-check file written next to the
  codegen helper its schema hashes to (`<helper>.resolver-checks.ts`, or
  `<helper>.<name>.resolver-checks.ts` when two endpoints share a helper). A
  missing codegen manifest entry for an endpoint's schema fails the build
  with an actionable error telling you to run `zelt graphql codegen`.
- `graphqlPlugin()` (from `@zeltjs/graphql/codegen`) now contributes a
  `PrebuiltContribution` per GraphQL endpoint so `zelt build`/`zelt dev` can
  assemble `.zelt/prebuilt.ts`. Each endpoint's generated runtime carries a
  `resolversHash` fingerprint, verified against the live resolver set at
  startup via the new `computeGraphqlPrebuiltHash()` export — this only
  detects staleness; the endpoint's `name`/key is what identifies it.
- New exported type `GraphqlPrebuiltEntry` describes a single endpoint's
  prebuilt entry (`{ runtime, resolversHash }`).
- New exported type `GqlSchemaRef` describes the `schema` export shape
  produced by `zelt graphql codegen` and consumed by `graphql()`.
- `graphqlPlugin()`'s `preBuild` now registers every runtime module, SDL
  file, and resolverChecks file it writes with the cli's output ledger
  (`BuildContext.registerGeneratedFile`, see `@zeltjs/cli`'s changelog), so
  removing an endpoint or resolver prunes its generated files on the next
  build. These files also carry a generated-file header comment, required
  for the ledger to recognize and prune them.
