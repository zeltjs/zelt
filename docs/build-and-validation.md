# Build and validation contracts

- `tsdown` owns published `dist/` files. TypeScript project-reference checking
  writes declarations and incremental state to `.typebuild/` only.
- Typechecking runs after distribution builds and checks each project source.
  Consumer checks use the public declarations installed from distribution artifacts.
- pnpm owns dependency installation, linking, lockfiles, and native build lifecycles.
  Validation scripts never edit files inside `node_modules` or inspect `.pnpm` layout.
- Local integration consumers install immutable distribution artifacts. A changed
  artifact has a different path; existing artifacts are never overwritten.
- Integration modes retain their own dependency resolution. Switching modes selects the matching
  lockfile and asks pnpm to reconcile the active installation.
- Studio identifies packages using package metadata and module resolution, including
  workspace symlinks. Packaging fixtures must not compensate for resolver failures.
- Nx declares prerequisites, cache inputs, and outputs. A cache hit and a real task
  execution must leave the same outputs; correctness must not require a build hook.
- Distribution caching hashes the prerequisite build's `dist/` outputs, including
  changes caused by build tools outside the package source directory.
- Installation and execution use the same Node runtime. Native dependencies use
  their supported installation lifecycle rather than an application postinstall rebuild.
- All GitHub workflows share the root-pinned Node/pnpm setup. Store caches include
  the actual Node and pnpm versions and the workflow: a faster website job must
  not prevent CI from retaining the native builds made by its integration consumers.
- Root discovery and dependency canonicalization share the same application
  boundary. Public JSON exports are data and are excluded from class lookup after
  module resolution; JavaScript import failures remain errors.
- Without an explicit application boundary, installed packages and export
  directories identify distributions. Root-level entries do not claim every
  application source file. Node resolves legacy `main` paths, including paths
  without `./`.
- Export conditions and concrete wildcard subpaths use Node's module resolver.
  Wildcard entries expand lazily within the published target directory; JSON,
  declarations, source maps, and static assets are excluded from class lookup.
  Legacy workspace entries use Node's directory resolution rather than requiring
  a package self-reference.

Verification must cover a fresh checkout, unchanged reruns, changed public types
and distributions, mode transitions, workspace and installed package resolution,
and failure propagation. Existing source, consumer, distribution, documentation,
lint, exception, snapshot, and runtime checks remain in the validation entry point.

TypeScript references include workspace test dependencies so incremental checking
tracks their changes. `auth-session` maps its own public name to `src/index.ts`
while checking source: this preserves declaration merging in its tests after the
compiler output is moved away from the published entry. Consumer checks still
resolve the packaged declarations without that source mapping.

Nx caches the current distribution archive and its index, not the whole artifact
history. Integration preparation explicitly materializes immutable installable
packages from that archive after either a cache hit or a real pack. Website build
outputs and tinyjs backend/frontend bundles are declared separately from library
`dist/`; frontend source assets are not cached as build output.

Mode lockfiles are generated consumer state under `.zelt/locks/`. Initial
preparation resolves that mode's dependencies; later preparation retains pnpm's
resolved choices while updating local artifact references. Installation then uses
the prepared lockfile with `--frozen-lockfile`. This does not claim reproducible
third-party resolution across fresh checkouts without those generated lockfiles.

Composite typechecking emits declarations only; its JavaScript is never a runtime
input. The no-emit Studio UI project explicitly enables incremental checking so
TypeScript retains semantic state instead of expecting nonexistent JavaScript
outputs on every invocation.

Project ordering and task reuse belong to Nx. Each package's checker runs the
TypeScript program with `--project --incremental`, rather than nesting `--build`
orchestrators. A regression fixture verifies that changing only an imported
published declaration still invalidates checking. `tsc --build` can otherwise
report the consumer up to date because its referenced `.typebuild` declaration
has not changed. The root command derives its project selection from the existing
root `tsconfig.json` references, preserving the inspection scope. For a package
check with prerequisites, use `pnpm nx run <project>:typecheck`.

Studio UI build runs Vite only. Nx explicitly requires its independent typecheck
first; that task owns the single `.typebuild/.tsbuildinfo` output. Keeping a
checker hidden inside the build script leaves cache restoration ambiguous and
causes the same intermediate state to have two task owners.
