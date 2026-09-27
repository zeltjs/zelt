import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/cli.ts',
    'src/index.ts',
    'src/config/index.ts',
    'src/studio/analyzer-entry.ts',
    // app を読み込む子プロセス。cli.js には束ねず、tsx が直接実行できる形で出す
    'src/studio/extraction/plugins/zelt-inspect-entry.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: {
    alwaysBundle: ['c12', 'citty', 'consola', 'ts-pattern'],
    neverBundle: [/^@zeltjs\//, 'tsdown', 'typescript', 'chokidar', 'jiti', 'tsx'],
  },
});
