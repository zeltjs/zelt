import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    neverBundle: [
      'hono',
      /^hono\//,
      /^@hono\//,
      '@zeltjs/core',
      /^@zeltjs\/core\//,
      '@zeltjs/kv',
      /^@zeltjs\/kv\//,
    ],
  },
});
