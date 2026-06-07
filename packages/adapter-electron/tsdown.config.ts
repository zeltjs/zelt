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
  entry: ['src/main/index.ts', 'src/preload/index.ts', 'src/renderer/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    neverBundle: [/^@zeltjs\//, 'electron'],
  },
});
