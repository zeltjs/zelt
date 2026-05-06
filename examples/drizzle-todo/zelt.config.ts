import { defineConfig } from '@zeltjs/openapi';

export default defineConfig({
  controllers: ['./src/**/*.controller.ts'],
  dist: './generated',
  tsconfig: './tsconfig.json',

  build: {
    entry: './src/entry/node.ts',
    outDir: './dist',
  },

  dev: {
    entry: './src/entry/node.ts',
    port: 3000,
  },
});
