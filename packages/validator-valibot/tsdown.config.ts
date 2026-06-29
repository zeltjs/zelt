import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/openapi/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    neverBundle: [
      '@zeltjs/openapi',
      /^@zeltjs\/openapi\//,
      'hono',
      /^hono\//,
      'valibot',
      /^valibot\//,
      '@valibot/to-json-schema',
    ],
  },
});
