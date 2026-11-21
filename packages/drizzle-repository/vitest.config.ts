import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: '@zeltjs/drizzle-repository',
      include: ['src/**/*.test.ts'],
      // The repository contract runs on real PostgreSQL and MySQL servers.
      globalSetup: ['./src/test/fixtures/databases.ts'],
      testTimeout: 30_000,
      hookTimeout: 120_000,
    },
    resolve: {
      alias: [
        {
          find: '@zeltjs/drizzle-repository/engine',
          replacement: resolve(__dirname, 'src/engine.ts'),
        },
        {
          find: '@zeltjs/drizzle-repository/metadata',
          replacement: resolve(__dirname, 'src/metadata.ts'),
        },
        { find: /^@zeltjs\/drizzle-repository$/, replacement: resolve(__dirname, 'src/index.ts') },
        {
          find: '@zeltjs/core/async-context',
          replacement: resolve(__dirname, '../core/src/async-context/index.ts'),
        },
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
