import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({ test: { name: '@zeltjs/adapter-tinyjs', include: ['src/**/*.test.ts'] } }),
);
