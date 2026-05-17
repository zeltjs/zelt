import swc from '@rollup/plugin-swc';
import { defineConfig } from 'tsdown';

const swcDecoratorPlugin = swc({
  jsc: {
    parser: { syntax: 'typescript', decorators: true },
    transform: { decoratorVersion: '2022-03' },
  },
});

export default defineConfig({
  plugins: [swcDecoratorPlugin],
  entry: [
    'src/index.ts',
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
    ],
  },
});
