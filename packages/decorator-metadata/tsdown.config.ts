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
  entry: ['src/index.ts', 'src/inspect/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    alwaysBundle: ['neverthrow', 'ts-pattern', '@zeltjs/unsafe-type-lib'],
    neverBundle: ['typescript', /^typescript-/],
  },
});
