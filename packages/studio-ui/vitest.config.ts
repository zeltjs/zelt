import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@zeltjs/studio-ui',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // test は dist に依存させない(build 前でも走る)
      '@zeltjs/studio-extract/snapshot': resolve(
        import.meta.dirname,
        '../studio-extract/src/core/snapshot-schema.lib.ts',
      ),
    },
  },
});
