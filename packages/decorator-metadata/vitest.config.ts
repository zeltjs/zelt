import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorVersion: '2022-03' },
      },
    }),
  ],
  esbuild: false,
  oxc: false,
  test: {
    globals: false,
    include: ['src/**/*.test.ts'],
    // ここの test は TS Compiler API の Program を張るので、他 project と並走すると
    // 既定の 5s を超える。openapi / graphql / validator-valibot と同じ猶予に合わせる
    testTimeout: 30_000,
  },
});
