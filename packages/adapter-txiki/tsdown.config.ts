import swc from '@rollup/plugin-swc';
import { defineConfig } from 'tsdown';

export default defineConfig({
  plugins: [
    swc({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorVersion: '2022-03' },
      },
    }),
  ],
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: { neverBundle: [/^@zeltjs\//] },
});
