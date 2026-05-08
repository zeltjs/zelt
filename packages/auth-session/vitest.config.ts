import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

import { sharedConfig } from '../../vitest.shared';

export default defineConfig({
  ...sharedConfig,
  test: {
    name: '@zeltjs/auth-session',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@zeltjs/core': resolve(__dirname, '../core/src/index.ts'),
      '@zeltjs/kv': resolve(__dirname, '../kv/src/index.ts'),
    },
  },
});
