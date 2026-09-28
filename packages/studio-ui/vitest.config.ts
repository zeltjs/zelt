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
      // subpath より後に置く: prefix 一致なので先に書くと /snapshot も奪ってしまう
      '@zeltjs/studio-extract': resolve(import.meta.dirname, '../studio-extract/src/index.ts'),
    },
  },
});
