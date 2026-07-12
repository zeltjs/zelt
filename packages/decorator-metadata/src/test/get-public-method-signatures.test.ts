import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { clearProgramCache, getPublicMethodSignatures } from '../inspect/index';

const TSCONFIG = resolve(__dirname, '../../tsconfig.json');
const FIXTURE = resolve(__dirname, './fixtures/signatures/sample-service.ts');

describe('getPublicMethodSignatures', () => {
  beforeAll(() => {
    clearProgramCache();
  });

  it('extracts instance public method signatures in declaration order', async () => {
    const result = await getPublicMethodSignatures(
      { filePath: FIXTURE, exportName: 'SampleService' },
      { tsconfig: TSCONFIG },
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual([
      { name: 'greet', params: [{ name: 'name', type: 'string' }], returnType: 'string' },
      // Promise は unwrap しない（宣言どおり）
      { name: 'fetchCount', params: [], returnType: 'Promise<number>' },
      // オーバーロードは宣言シグネチャを列挙し、実装シグネチャは除外する
      { name: 'overloaded', params: [{ name: 'value', type: 'string' }], returnType: 'string' },
      { name: 'overloaded', params: [{ name: 'value', type: 'number' }], returnType: 'number' },
    ]);
  });

  it('returns empty array for a class without public methods', async () => {
    const result = await getPublicMethodSignatures(
      { filePath: FIXTURE, exportName: 'EmptyService' },
      { tsconfig: TSCONFIG },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual([]);
  });

  it('returns SOURCE_NOT_FOUND for a file outside the program', async () => {
    const result = await getPublicMethodSignatures(
      { filePath: resolve(__dirname, './fixtures/signatures/no-such.ts'), exportName: 'X' },
      { tsconfig: TSCONFIG },
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('SOURCE_NOT_FOUND');
  });

  it('returns EXPORT_NOT_FOUND when the class is not in the file', async () => {
    const result = await getPublicMethodSignatures(
      { filePath: FIXTURE, exportName: 'NoSuchClass' },
      { tsconfig: TSCONFIG },
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('EXPORT_NOT_FOUND');
  });

  // ClassSource.exportName は公開名: default / 別名 export でも解決できること
  it('resolves a default-exported class', async () => {
    const result = await getPublicMethodSignatures(
      {
        filePath: resolve(__dirname, './fixtures/signatures/default-service.ts'),
        exportName: 'default',
      },
      { tsconfig: TSCONFIG },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual([{ name: 'ping', params: [], returnType: 'boolean' }]);
  });

  it('resolves an alias-exported class by its public name', async () => {
    const result = await getPublicMethodSignatures(
      { filePath: FIXTURE, exportName: 'RenamedService' },
      { tsconfig: TSCONFIG },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual([{ name: 'ping', params: [], returnType: 'number' }]);
  });
});
