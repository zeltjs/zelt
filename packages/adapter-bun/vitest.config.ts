import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    resolve: {
      alias: {
        '@zeltjs/core': resolve(__dirname, '../core/src/index.ts'),
      },
    },
    test: {
      name: '@zeltjs/adapter-bun',
      include: ['src/**/*.test.ts'],
    },
  }),
);
