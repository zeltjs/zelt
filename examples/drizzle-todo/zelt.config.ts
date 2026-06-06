import { defineConfig } from '@zeltjs/cli';
import { openapiPlugin } from '@zeltjs/openapi';

export default defineConfig({
  app: () => import('./src/app').then((m) => m.app),
  plugins: [openapiPlugin({ outDir: './generated', tsconfig: './tsconfig.json' })],

  build: {
    entry: './src/node.ts',
    outDir: './dist',
  },

  dev: {
    entry: './src/node.ts',
    port: 3000,
  },
});
