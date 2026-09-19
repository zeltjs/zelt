import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { clearProgramCache, getClassDeclarations } from '../inspect/index';

const TSCONFIG = resolve(__dirname, '../../tsconfig.json');
const FIXTURE = resolve(__dirname, './fixtures/classes/mixed-classes.ts');

describe('getClassDeclarations', () => {
  beforeAll(() => {
    clearProgramCache();
  });

  it('enumerates every class declaration in the file regardless of export', async () => {
    const result = await getClassDeclarations(FIXTURE, { tsconfig: TSCONFIG });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.map((c) => c.name).sort()).toEqual([
      'AliasedInternal',
      'DefaultExported',
      'Dep',
      'ExportedDecorated',
      'NonExportedMultiDecorated',
      'UndecoratedInternal',
    ]);
  });

  it('レビュー指摘6: sets exportName only when the export identity differs from the declaration name', async () => {
    const result = await getClassDeclarations(FIXTURE, { tsconfig: TSCONFIG });
    if (!result.isOk()) throw new Error('expected ok');
    const byName = (name: string) => result.value.find((c) => c.name === name);
    // default export: ClassNode の id/name には使えない 'default' が exportName に入る
    expect(byName('DefaultExported')?.exportName).toBe('default');
    // 通常の named export(exportName === name)では省略する
    expect(byName('ExportedDecorated')?.exportName).toBeUndefined();
    // `export { AliasedInternal as PublicAlias }`: 宣言名と公開名が異なる
    expect(byName('AliasedInternal')?.exportName).toBe('PublicAlias');
    expect(byName('AliasedInternal')?.exported).toBe(true);
    // export が一切無い内部クラスは exportName も無い
    expect(byName('UndecoratedInternal')?.exportName).toBeUndefined();
  });

  it('sets exported true only for classes with an export modifier', async () => {
    const result = await getClassDeclarations(FIXTURE, { tsconfig: TSCONFIG });
    if (!result.isOk()) throw new Error('expected ok');
    const byName = (name: string) => result.value.find((c) => c.name === name);
    expect(byName('ExportedDecorated')?.exported).toBe(true);
    expect(byName('DefaultExported')?.exported).toBe(true);
    expect(byName('UndecoratedInternal')?.exported).toBe(false);
    expect(byName('NonExportedMultiDecorated')?.exported).toBe(false);
  });

  it('collects decorator name/line/args in declaration order (team-lead decision: UseMiddleware line lookup)', async () => {
    const result = await getClassDeclarations(FIXTURE, { tsconfig: TSCONFIG });
    if (!result.isOk()) throw new Error('expected ok');
    const multi = result.value.find((c) => c.name === 'NonExportedMultiDecorated');
    expect(multi?.decorators).toEqual([
      { name: 'Service', line: 20, args: [] },
      { name: 'Wired', line: 21, args: [{ filePath: FIXTURE, exportName: 'Dep' }] },
    ]);
  });

  it('returns an empty decorators array for an undecorated class', async () => {
    const result = await getClassDeclarations(FIXTURE, { tsconfig: TSCONFIG });
    if (!result.isOk()) throw new Error('expected ok');
    expect(result.value.find((c) => c.name === 'UndecoratedInternal')?.decorators).toEqual([]);
  });

  it('computes loc from the class declaration start (including leading decorators) to its closing brace', async () => {
    const result = await getClassDeclarations(FIXTURE, { tsconfig: TSCONFIG });
    if (!result.isOk()) throw new Error('expected ok');
    const exported = result.value.find((c) => c.name === 'ExportedDecorated');
    // フィクスチャの `@Service`(15行目)から `}`(18行目)まで(Step 5 のフィクスチャ実測値)
    expect(exported?.loc).toEqual({ start: 15, end: 18 });
  });

  it('returns SOURCE_NOT_FOUND for a file outside the program', async () => {
    const result = await getClassDeclarations(resolve(__dirname, './fixtures/classes/no-such.ts'), {
      tsconfig: TSCONFIG,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('SOURCE_NOT_FOUND');
  });
});
