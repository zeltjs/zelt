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
  entry: ['src/index.ts', 'src/adaptor-memory/index.ts', 'src/adaptor-redis/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    neverBundle: [
      '@zeltjs/core',
      /^@zeltjs\/core\//,
      '@zeltjs/redis',
      /^@zeltjs\/redis\//,
      'ioredis',
    ],
  },
});
