import { defineConfig } from '@zeltjs/openapi';
import { valibotAdapter } from '@zeltjs/validate-valibot/openapi';

export default defineConfig({
  controllers: ['./src/**/*.controller.ts'],
  dist: './generated',
  tsconfig: './tsconfig.json',
  requestValidator: valibotAdapter,

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
