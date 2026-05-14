import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

import { sharedConfig } from '../../vitest.shared';

export default defineConfig({
  ...sharedConfig,
  test: {
    name: '@zeltjs/auth-session',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@zeltjs/core/internal-bridge/testing': resolve(
        __dirname,
        '../core/src/internal-bridge/testing.ts',
      ),
      '@zeltjs/core/internal-bridge/errors': resolve(
        __dirname,
        '../core/src/internal-bridge/errors.ts',
      ),
      '@zeltjs/core': resolve(__dirname, '../core/src/index.ts'),
      '@zeltjs/kv': resolve(__dirname, '../kv/src/index.ts'),
    },
  },
});
