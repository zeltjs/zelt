import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: '@zeltjs/graphql-drizzle',
      include: ['src/**/*.test.ts'],
      testTimeout: 30_000,
    },
    resolve: {
      alias: [
        {
          find: '@zeltjs/graphql/codegen',
          replacement: resolve(__dirname, '../graphql/src/codegen.ts'),
        },
        { find: '@zeltjs/graphql', replacement: resolve(__dirname, '../graphql/src/index.ts') },
        { find: '@zeltjs/cli', replacement: resolve(__dirname, '../cli/src/index.ts') },
        { find: '@zeltjs/core', replacement: resolve(__dirname, '../core/src/index.ts') },
        { find: '@zeltjs/db', replacement: resolve(__dirname, '../db/src/index.ts') },
        {
          find: '@zeltjs/decorator-metadata/inspect',
          replacement: resolve(__dirname, '../decorator-metadata/src/inspect/index.ts'),
        },
        {
          find: '@zeltjs/decorator-metadata',
          replacement: resolve(__dirname, '../decorator-metadata/src/index.ts'),
        },
      ],
    },
  }),
);
