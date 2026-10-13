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
  entry: { main: 'src/main.ts' },
  format: ['esm'],
  target: 'es2022',
  platform: 'neutral',
  dts: false,
  clean: true,
  deps: { alwaysBundle: [/^@zeltjs\//, 'hono', /^hono\//] },
});
