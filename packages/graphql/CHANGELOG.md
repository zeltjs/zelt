# Changelog

## Unreleased

### Breaking Changes

- Build-time GraphQL APIs now belong to `@zeltjs/graphql/codegen`. Update root
  imports of `graphqlPlugin`, SDL/runtime generators, schema-first generators,
  metadata inspection, and GraphQL type conversion helpers to the codegen
  subpath.
- Runtime module strings are no longer converted through Node filesystem APIs.
  Prefer `runtimeLoader: () => import(...)` or pass a generated manifest via
  `runtime`; keep `runtimeModule` as the codegen output path when generation is
  required.
