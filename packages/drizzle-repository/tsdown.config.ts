import { defineConfig } from 'tsdown';

// ESM only: the CLI awaits at the top level, and the staging scope must be one module instance
// shared by the generated repositories and the application.
export default defineConfig({
  entry: ['src/index.ts', 'src/engine.ts', 'src/metadata.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  fixedExtension: false,
  outputOptions: { comments: { jsdoc: false } },
  deps: {
    neverBundle: [
      /^@zeltjs\/(?:cli|core|db)(?:\/|$)/,
      /^drizzle-orm(?:\/|$)/,
      /^drizzle-metadata(?:\/|$)/,
      'neverthrow',
      'jiti',
    ],
  },
});
