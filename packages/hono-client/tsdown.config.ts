import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    neverBundle: ['hono', /^hono\//, /^@hono\//, '@zeltjs/core', '@zeltjs/adapter-node'],
  },
});
