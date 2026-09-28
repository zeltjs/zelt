import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    // ブラウザからも読む葉モジュール。node/typescript を引き込む index とは別 chunk に出す
    'snapshot/index': 'src/core/snapshot-schema.lib.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    alwaysBundle: ['consola', 'ts-pattern'],
    neverBundle: [/^@zeltjs\//, 'tsdown', 'typescript', 'tsx', 'valibot'],
  },
});
