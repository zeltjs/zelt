import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/redis/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    neverBundle: [
      /^@zeltjs\//,
      'hono',
      /^hono\//,
      /^@hono\//,
      'vitest',
      'testcontainers',
      'ioredis',
    ],
  },
});
