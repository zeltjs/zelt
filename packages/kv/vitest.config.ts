import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: '@zeltjs/kv',
      include: ['src/**/*.test.ts'],
      exclude: ['src/compliance.test.ts'],
    },
  }),
);
