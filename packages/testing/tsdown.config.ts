import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/redis/index.ts',
    'src/adapters/vitest.ts',
    'src/adapters/jest.ts',
    'src/adapters/bun.ts',
    'src/adapters/node.ts',
  ],
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
      'jest',
      'bun:test',
      'node:test',
      'testcontainers',
      'ioredis',
    ],
  },
});
