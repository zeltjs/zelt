import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { clearProgramCache, getOrCreateProgram } from '../inspect/index';

const INVALID_TSCONFIG = resolve(__dirname, './fixtures/invalid-tsconfig/tsconfig.json');

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
});
