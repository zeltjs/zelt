import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@zeltjs/testing',
    include: ['src/**/*.test.ts'],
    // testing util 自体には test ファイルを置かない方針 (spec §7.2)
    passWithNoTests: true,
  },
});
