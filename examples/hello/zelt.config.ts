import { defineConfig } from '@zeltjs/cli';
import { honoClientPlugin } from '@zeltjs/hono-client';
import { openapiPlugin } from '@zeltjs/openapi';

export default defineConfig({
  app: () => import('./src/app').then((m) => m.app),
  plugins: [
    openapiPlugin({ outDir: './generated', tsconfig: './tsconfig.json' }),
    honoClientPlugin({ outDir: './generated' }),
  ],

  // Build settings for @zeltjs/cli
  build: {
    entry: './src/node.ts',
    outDir: './dist',
  },

  // Dev settings for @zeltjs/cli
  dev: {
    entry: './src/node.ts',
    port: 3000,
  },
});
