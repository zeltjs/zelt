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
  entry: ['src/index.ts', 'src/testing/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    neverBundle: [
      '@zeltjs/core',
      /^@zeltjs\/core\//,
      '@zeltjs/testing',
      /^@zeltjs\/testing\//,
      'ioredis',
      'testcontainers',
    ],
  },
});
