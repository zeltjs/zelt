import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: '@zeltjs/graphql',
      include: ['src/**/*.test.ts'],
      passWithNoTests: true,
      testTimeout: 30_000,
    },
    resolve: {
      alias: [
        { find: '@zeltjs/cli', replacement: resolve(__dirname, '../cli/src/index.ts') },
        {
          find: '@zeltjs/decorator-metadata/inspect',
          replacement: resolve(__dirname, '../decorator-metadata/src/inspect/index.ts'),
        },
        {
          find: '@zeltjs/decorator-metadata',
          replacement: resolve(__dirname, '../decorator-metadata/src/index.ts'),
        },
        { find: '@zeltjs/core', replacement: resolve(__dirname, '../core/src/index.ts') },
        {
          find: '@zeltjs/unsafe-type-lib',
          replacement: resolve(__dirname, '../unsafe-type-lib/src/index.ts'),
        },
      ],
    },
  }),
);
