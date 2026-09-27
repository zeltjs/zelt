import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { clearProgramCache, getFunctionSignature } from '../inspect/index';

const TSCONFIG = resolve(__dirname, '../../tsconfig.json');
const MIXED = resolve(__dirname, './fixtures/functions/mixed-file.ts');
const MODULE_FNS = resolve(__dirname, './fixtures/functions/module-functions.ts');
const CROSS_MODULE_TYPE = resolve(__dirname, './fixtures/functions/cross-module-type.ts');
const AMBIGUOUS_ACCESSOR = resolve(__dirname, './fixtures/functions/ambiguous-accessor.ts');

describe('getFunctionSignature', () => {
  beforeAll(() => {
    clearProgramCache();
  });

  it('extracts a method signature by owner + name', async () => {
    const result = await getFunctionSignature(
      { kind: 'method', filePath: MIXED, owner: 'Widget', name: 'render' },
      { tsconfig: TSCONFIG },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({ params: [], returnType: 'string' });
  });

  it('extracts a module-level function signature by name (no owner)', async () => {
    const result = await getFunctionSignature(
      { kind: 'function', filePath: MODULE_FNS, name: 'exportedFn' },
      { tsconfig: TSCONFIG },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({
      params: [{ name: 'value', type: 'string' }],
      returnType: 'string',
    });
  });

  it('extracts a non-exported const arrow function signature the same way', async () => {
    const result = await getFunctionSignature(
      { kind: 'function', filePath: MODULE_FNS, name: 'privateFn' },
      { tsconfig: TSCONFIG },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({
      params: [{ name: 'value', type: 'number' }],
      returnType: 'number',
    });
  });

  it('collapses an overloaded method to the implementation signature (union types)', async () => {
    const result = await getFunctionSignature(
      { kind: 'method', filePath: MIXED, owner: 'Widget', name: 'greet' },
      { tsconfig: TSCONFIG },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({
      params: [{ name: 'target', type: 'string | number' }],
      returnType: 'string',
    });
  });

  it('extracts a get accessor signature the same way as a method (design memo 12)', async () => {
    const result = await getFunctionSignature(
      { kind: 'method', filePath: MIXED, owner: 'Widget', name: 'label' },
      { tsconfig: TSCONFIG },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({ params: [], returnType: 'string' });
  });

  it('extracts a set accessor signature with its one parameter and a void return type (design memo 12)', async () => {
    const result = await getFunctionSignature(
      { kind: 'method', filePath: MIXED, owner: 'Widget', name: 'config' },
      { tsconfig: TSCONFIG },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({
      params: [{ name: 'value', type: 'string' }],
      returnType: 'void',
    });
  });

  it('returns SOURCE_NOT_FOUND for a file outside the program', async () => {
    const result = await getFunctionSignature(
      {
        kind: 'function',
        filePath: resolve(__dirname, './fixtures/functions/no-such.ts'),
        name: 'x',
      },
      { tsconfig: TSCONFIG },
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('SOURCE_NOT_FOUND');
  });

  it('returns EXPORT_NOT_FOUND when the owner class does not exist in the file', async () => {
    const result = await getFunctionSignature(
      { kind: 'method', filePath: MIXED, owner: 'NoSuchClass', name: 'render' },
      { tsconfig: TSCONFIG },
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('EXPORT_NOT_FOUND');
  });

  // レビュー指摘5: get x()/set x(v) が同名で共存する場合、owner+name(kind:'method')だけでは
  // どちらの accessor を指しているか一意に決まらない。黙って先勝ちで選ばず fail する
  it('returns AMBIGUOUS_MEMBER when a get/set accessor pair shares the same name', async () => {
    const result = await getFunctionSignature(
      { kind: 'method', filePath: AMBIGUOUS_ACCESSOR, owner: 'AmbiguousAccessor', name: 'x' },
      { tsconfig: TSCONFIG },
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('AMBIGUOUS_MEMBER');
  });

  it('returns SIGNATURE_NOT_FOUND when the method name does not exist on the owner', async () => {
    const result = await getFunctionSignature(
      { kind: 'method', filePath: MIXED, owner: 'Widget', name: 'noSuchMethod' },
      { tsconfig: TSCONFIG },
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('SIGNATURE_NOT_FOUND');
  });

  // team-lead 決定(Task 10 remaining-diff cause 7): typeToString に enclosingDeclaration
  // (関数宣言自身)を渡すことで、他モジュールで宣言された型が `import("pkg").X<...>` で
  // 修飾されることを確認する(渡さない場合は `Ok<string, never>` のように裸の名前になり、
  // ec-backend の App<...>/HttpFeature<...> 等と同じ食い違いを再現していた)
  it('qualifies a cross-module return type with import("pkg") when passing the declaration as enclosingDeclaration', async () => {
    const result = await getFunctionSignature(
      { kind: 'function', filePath: CROSS_MODULE_TYPE, name: 'makeOk' },
      { tsconfig: TSCONFIG },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.returnType).toBe('import("neverthrow").Ok<string, never>');
  });
});
