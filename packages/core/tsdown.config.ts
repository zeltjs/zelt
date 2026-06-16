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
    'src/internal-bridge/testing.ts',
    'src/internal-bridge/errors.ts',
    'src/http-invocation.ts',
    'src/http-invocation-runtime.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    alwaysBundle: ['croner', 'ts-pattern', '@zeltjs/unsafe-type-lib'],
    neverBundle: ['hono', /^hono\//, /^@hono\//, 'valibot'],
  },
});
