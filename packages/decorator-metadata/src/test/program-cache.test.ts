import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { clearProgramCache, getOrCreateProgram } from '../inspect/index';

const TSCONFIG = resolve(__dirname, '../../tsconfig.json');
const INVALID_TSCONFIG = resolve(__dirname, './fixtures/invalid-tsconfig/tsconfig.json');
const EXTRA_ROOT_FILE = resolve(__dirname, './fixtures/invalid-tsconfig/src/empty.ts');

describe('program-cache', () => {
  beforeAll(() => {
    clearProgramCache();
  });

  // レビュー指摘1: compilerOptions の不正値は parseJsonConfigFileContent の errors 配列に
  // 積まれるだけで例外にならない。ここを見ずに Program を作ると、以降の全 inspect 呼び出しが
  // 原因不明な形で失敗する(壊れた既定値の Program が黙って使われる)
  it('returns TSCONFIG_ERROR when compilerOptions has an invalid value, instead of silently building a Program with fallback defaults', async () => {
    const result = await getOrCreateProgram(INVALID_TSCONFIG);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('TSCONFIG_ERROR');
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  // レビュー指摘11: extraRootFiles ありでキャッシュされたエントリは
  // `${tsconfigPath}\x00...` という別鍵になる(cacheKeyFor)ため、tsconfigPath の完全一致だけを
  // 消す実装だと clearProgramCache(tsconfigPath) を呼んでも古い Program が残り続けていた
  it('clearProgramCache(tsconfigPath) also evicts entries cached with extraRootFiles for that tsconfig', async () => {
    const first = await getOrCreateProgram(TSCONFIG, { extraRootFiles: [EXTRA_ROOT_FILE] });
    if (first.isErr()) throw new Error('expected ok');

    clearProgramCache(TSCONFIG);

    const second = await getOrCreateProgram(TSCONFIG, { extraRootFiles: [EXTRA_ROOT_FILE] });
    if (second.isErr()) throw new Error('expected ok');

    // clearProgramCache が効いていれば ts.createProgram が再実行され、新しい Program
    // インスタンス(参照)になる。効いていなければ同じキャッシュ済みインスタンスが返る
    expect(second.value.program).not.toBe(first.value.program);
    // パッケージ全体の tsconfig を extraRootFiles 付きで2回コンパイルするため、既定の
    // 5000ms では環境負荷次第でタイムアウトしうる(ロジックの遅さではなく Program 生成の
    // コスト。他の *.test.ts も同種の重さを許容する既定のテストタイムアウト設定が無いため
    // このテストにだけ明示する)
  }, 20_000);
});
