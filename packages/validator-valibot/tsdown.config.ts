import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/openapi/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    neverBundle: [
      '@zeltjs/core',
      /^@zeltjs\/core\//,
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
