import { defineConfig } from '@zeltjs/openapi';

export default defineConfig({
  controllers: ['./src/**/*.controller.ts'],
  dist: './generated',
  tsconfig: './tsconfig.json',

  // Build settings for @zeltjs/cli
  build: {
    entry: './src/entry/node.ts',
    outDir: './dist',
  },

  // Dev settings for @zeltjs/cli
  dev: {
    entry: './src/entry/node.ts',
    port: 3000,
  },
});
