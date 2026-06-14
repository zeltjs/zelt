import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    resolve: {
      alias: {
        '@zeltjs/core': resolve(__dirname, '../core/src/index.ts'),
        '@zeltjs/openapi': resolve(__dirname, '../openapi/src/index.ts'),
        '@zeltjs/validator-valibot': resolve(__dirname, './src/index.ts'),
      },
    },
    test: {
      name: '@zeltjs/validator-valibot',
      include: ['src/**/*.test.ts'],
      testTimeout: 30_000,
    },
  }),
);
