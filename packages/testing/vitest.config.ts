import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedConfig } from '../../vitest.shared';

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: '@zeltjs/testing',
      include: ['src/**/*.test.ts'],
      // testing util 自体には test ファイルを置かない方針 (spec §7.2)
      passWithNoTests: true,
    },
  }),
);
