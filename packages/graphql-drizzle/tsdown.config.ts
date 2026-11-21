import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/codegen.ts', 'src/metadata.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  fixedExtension: false,
  outputOptions: { comments: { jsdoc: false } },
  deps: { neverBundle: [/^@zeltjs\//, /^drizzle-orm(?:\/|$)/, /^drizzle-metadata(?:\/|$)/] },
});
