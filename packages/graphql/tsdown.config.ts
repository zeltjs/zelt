import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/codegen.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    neverBundle: [/^@zeltjs\//],
  },
});
