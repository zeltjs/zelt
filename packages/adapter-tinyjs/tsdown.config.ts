import swc from '@rollup/plugin-swc';
import { defineConfig } from 'tsdown';

export default defineConfig({
  plugins: [
    swc({
      swc: {
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          loose: false,
          transform: { decoratorVersion: '2022-03', useDefineForClassFields: true },
        },
      },
    }),
  ],
  entry: ['src/index.ts', 'src/renderer/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: { neverBundle: [/^@zeltjs\//] },
});
