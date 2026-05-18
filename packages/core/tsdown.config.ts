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
    'src/workers.ts',
    'src/lambda.ts',
    'src/modules/logger/index.ts',
    'src/modules/env/index.ts',
    'src/runtime/index.ts',
    'src/internal-bridge/testing.ts',
    'src/internal-bridge/errors.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    alwaysBundle: ['croner', 'ts-pattern'],
    neverBundle: ['hono', /^hono\//, /^@hono\//, 'valibot'],
  },
});
