import { defineConfig } from 'tsdown';

const deps = {
  alwaysBundle: ['c12', 'citty', 'consola', 'ts-pattern', '@zeltjs/studio-extract'],
  // studio-extract は private なので dist に束ねる。他の @zeltjs/* は npm から解決させる
  neverBundle: [/^@zeltjs\/(?!studio-extract$)/, 'tsdown', 'typescript', 'chokidar', 'jiti', 'tsx'],
};

export default defineConfig([
  {
    entry: ['src/cli.ts', 'src/index.ts', 'src/config/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    fixedExtension: false,
    deps,
  },
  {
    // app を読み込む子プロセス。cli.js には束ねず、tsx が直接実行できる形で出す。
    // source は studio-extract 側にあり cli の tsconfig に含まれないため dts は作らない
    // (型の公開面ではなく実行されるだけのスクリプト)
    entry: {
      'studio-extract/zelt-inspect-entry': '../studio-extract/src/plugins/zelt-inspect-entry.ts',
    },
    format: ['esm'],
    dts: false,
    clean: false,
    fixedExtension: false,
    deps,
  },
]);
