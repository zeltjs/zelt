import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { clearProgramCache, getFunctionDeclarations } from '../inspect/index';

const TSCONFIG = resolve(__dirname, '../../tsconfig.json');
const MIXED = resolve(__dirname, './fixtures/functions/mixed-file.ts');
const MODULE_FNS = resolve(__dirname, './fixtures/functions/module-functions.ts');
const ANONYMOUS_CALLBACK = resolve(__dirname, './fixtures/functions/anonymous-callback.ts');

describe('getFunctionDeclarations', () => {
  beforeAll(() => {
    clearProgramCache();
  });

  it('enumerates class methods, excluding the constructor', async () => {
    const result = await getFunctionDeclarations(MIXED, { tsconfig: TSCONFIG });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    const names = result.value.map((f) => f.ref.name);
    expect(names).not.toContain('constructor');
    expect(names).toEqual(expect.arrayContaining(['render', 'guarded', 'create', 'greet']));
  });

  it('includes get accessors as FnNode candidates (real evidence: ec-backend EcJwtConfig.secret/expiresIn/resolveUser are get accessors and appear as FnNodes in the mock)', async () => {
    const result = await getFunctionDeclarations(MIXED, { tsconfig: TSCONFIG });
    if (!result.isOk()) throw new Error('expected ok');
    expect(result.value.map((f) => f.ref.name)).toContain('label');
  });

  it('includes set accessors as FnNode candidates (design memo 12)', async () => {
    const result = await getFunctionDeclarations(MIXED, { tsconfig: TSCONFIG });
    if (!result.isOk()) throw new Error('expected ok');
    expect(result.value.map((f) => f.ref.name)).toContain('config');
  });

  it('sets visibility from private/protected modifiers; static does not affect visibility', async () => {
    const result = await getFunctionDeclarations(MIXED, { tsconfig: TSCONFIG });
    if (!result.isOk()) throw new Error('expected ok');
    const byName = (name: string) => result.value.find((f) => f.ref.name === name);

    expect(byName('render')?.visibility).toBe('public');
    expect(byName('guarded')?.visibility).toBe('private');
    expect(byName('create')?.visibility).toBe('public'); // static だが private/protected 修飾なし
  });

  it('sets owner to the declaring class name for methods', async () => {
    const result = await getFunctionDeclarations(MIXED, { tsconfig: TSCONFIG });
    if (!result.isOk()) throw new Error('expected ok');
    const render = result.value.find((f) => f.ref.name === 'render');
    expect(render?.ref).toEqual({
      kind: 'method',
      filePath: MIXED,
      owner: 'Widget',
      name: 'render',
    });
  });

  it('returns decorator name/line/args for a bare decorator with no arguments', async () => {
    const result = await getFunctionDeclarations(MIXED, { tsconfig: TSCONFIG });
    if (!result.isOk()) throw new Error('expected ok');
    const render = result.value.find((f) => f.ref.name === 'render');
    expect(render?.decorators).toEqual([{ name: 'LogCall', line: 19, args: [] }]);
  });

  it('resolves decorator factory arguments to a ClassSource via TypeChecker (レビュー指摘8: import 別名対策)', async () => {
    const result = await getFunctionDeclarations(MIXED, { tsconfig: TSCONFIG });
    if (!result.isOk()) throw new Error('expected ok');
    const guarded = result.value.find((f) => f.ref.name === 'guarded');
    expect(guarded?.decorators).toEqual([
      { name: 'Wired', line: 25, args: [{ filePath: MIXED, exportName: 'Dep' }] },
    ]);
  });

  it('resolves a decorator argument passed via an import alias to the ClassSource of the real declaration, not the local alias text (レビュー指摘8)', async () => {
    const result = await getFunctionDeclarations(MIXED, { tsconfig: TSCONFIG });
    if (!result.isOk()) throw new Error('expected ok');
    const aliased = result.value.find((f) => f.ref.name === 'aliasedDecoratorArg');
    expect(aliased?.decorators).toEqual([
      {
        name: 'Wired',
        line: 33,
        args: [
          {
            filePath: resolve(__dirname, './fixtures/functions/dep-external.ts'),
            exportName: 'ExternalDep',
          },
        ],
      },
    ]);
  });

  it('collapses overloads into a single implementation-signature declaration', async () => {
    const result = await getFunctionDeclarations(MIXED, { tsconfig: TSCONFIG });
    if (!result.isOk()) throw new Error('expected ok');
    const greets = result.value.filter((f) => f.ref.name === 'greet');
    expect(greets).toHaveLength(1);
  });

  it('enumerates module-scope function declarations and const arrow bindings, excluding call expressions', async () => {
    const result = await getFunctionDeclarations(MODULE_FNS, { tsconfig: TSCONFIG });
    if (!result.isOk()) throw new Error('expected ok');
    const names = result.value.map((f) => f.ref.name).sort();
    expect(names).toEqual(['exportedArrow', 'exportedFn', 'privateFn', 'reExportedFn']);
    expect(result.value.every((f) => f.ref.kind === 'function')).toBe(true);
  });

  it('sets visibility from export presence for module-scope functions', async () => {
    const result = await getFunctionDeclarations(MODULE_FNS, { tsconfig: TSCONFIG });
    if (!result.isOk()) throw new Error('expected ok');
    const byName = (name: string) => result.value.find((f) => f.ref.name === name);
    expect(byName('exportedFn')?.visibility).toBe('public');
    expect(byName('exportedArrow')?.visibility).toBe('public');
    expect(byName('privateFn')?.visibility).toBe('private');
  });

  // レビュー指摘8: `const fn = () => {}; export { fn };` のような別文での再export は、
  // 宣言自体に export 修飾子が付かないため、修飾子だけを見る判定では private に誤判定される
  it('sets visibility to public for a module function re-exported via a separate `export { fn }` statement', async () => {
    const result = await getFunctionDeclarations(MODULE_FNS, { tsconfig: TSCONFIG });
    if (!result.isOk()) throw new Error('expected ok');
    const byName = (name: string) => result.value.find((f) => f.ref.name === name);
    expect(byName('reExportedFn')?.visibility).toBe('public');
  });

  // レビュー指摘10: 引数としてインラインで渡される無名/名前付き関数式コールバックは
  // どの const/let にも束縛されないため FunctionDeclarationInfo として列挙されない
  // (collectFunctionDeclarations が sourceFile.statements 直下とクラスメンバーしか
  // 見ないことの構造的な帰結。リグレッションガード)
  it('does not enumerate inline anonymous/named callback arguments as function declarations', async () => {
    const result = await getFunctionDeclarations(ANONYMOUS_CALLBACK, { tsconfig: TSCONFIG });
    if (!result.isOk()) throw new Error('expected ok');
    const names = result.value.map((f) => f.ref.name).sort();
    expect(names).toEqual(['doSomething', 'runWithCallbacks']);
  });

  it('returns SOURCE_NOT_FOUND for a file outside the program', async () => {
    const result = await getFunctionDeclarations(
      resolve(__dirname, './fixtures/functions/no-such.ts'),
      { tsconfig: TSCONFIG },
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('SOURCE_NOT_FOUND');
  });
});
