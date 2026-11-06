import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/codegen.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  fixedExtension: false,
  outputOptions: { comments: { jsdoc: false } },
  deps: {
    neverBundle: [/^@zeltjs\//, 'graphql'],
    // Resolve the handler's GraphQL imports through this package's peer as well.
    alwaysBundle: ['graphql-http'],
  },
});
