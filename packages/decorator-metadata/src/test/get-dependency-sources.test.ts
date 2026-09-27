import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import type { DependencySource } from '../inspect/index';
import { clearProgramCache, getDependencySources } from '../inspect/index';

const tsconfig = resolve(__dirname, '../../tsconfig.json');
const consumerPath = resolve(__dirname, './fixtures/class-source/dep-consumer.ts');
const exportedPath = resolve(__dirname, './fixtures/class-source/exported.ts');
const defaultDepPath = resolve(__dirname, './fixtures/class-source/default-dep.ts');
const barrelDir = resolve(__dirname, './fixtures/class-source/barrel');
const barrelIndexPath = resolve(barrelDir, 'index.barrel.ts');
const barrelConsumerPath = resolve(barrelDir, 'barrel-consumer.ts');
const barrelPlainPath = resolve(barrelDir, 'plain.service.ts');
const barrelRenamedPath = resolve(barrelDir, 'renamed.service.ts');
const barrelStarPath = resolve(barrelDir, 'star.service.ts');
const barrelLeafPath = resolve(barrelDir, 'leaf.service.ts');

const byLocalName = (
  deps: readonly DependencySource[],
  localName: string,
): DependencySource | undefined => deps.find((d) => d.localName === localName);

describe('getDependencySources', () => {
  beforeAll(() => {
    clearProgramCache();
  });

  const getConsumerDeps = async () => {
    const result = await getDependencySources(
      { filePath: consumerPath, exportName: 'Consumer' },
      { tsconfig },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) throw new Error('expected ok');
    return result.value;
  };

  const getBarrelConsumerDeps = async () => {
    const result = await getDependencySources(
      { filePath: barrelConsumerPath, exportName: 'BarrelConsumer' },
      { tsconfig },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) throw new Error('expected ok');
    return result.value;
  };

  it('resolves a named import dependency to its canonical ClassSource', async () => {
    const deps = await getConsumerDeps();
    expect(byLocalName(deps, 'ExportedService')).toEqual({
      kind: 'class',
      localName: 'ExportedService',
      source: { filePath: exportedPath, exportName: 'ExportedService' },
      line: 20,
    });
  });

  it('keeps the export name for aliased imports (identity-canonical)', async () => {
    const deps = await getConsumerDeps();
    expect(byLocalName(deps, 'AliasedService')).toEqual({
      kind: 'class',
      localName: 'AliasedService',
      source: { filePath: exportedPath, exportName: 'AliasedService' },
      line: 21,
    });
  });

  it('resolves a same-file dependency through its aliased export', async () => {
    const deps = await getConsumerDeps();
    expect(byLocalName(deps, 'LocalDep')).toEqual({
      kind: 'class',
      localName: 'LocalDep',
      source: { filePath: consumerPath, exportName: 'PublicLocalDep' },
      line: 22,
    });
  });

  it('resolves a default-import dependency', async () => {
    const deps = await getConsumerDeps();
    expect(byLocalName(deps, 'DefaultDep')).toEqual({
      kind: 'class',
      localName: 'DefaultDep',
      source: { filePath: defaultDepPath, exportName: 'default' },
      line: 23,
    });
  });

  it('reports a non-exported same-file dependency as unresolved', async () => {
    const result = await getDependencySources(
      {
        filePath: resolve(__dirname, './fixtures/class-source/unresolved-consumer.ts'),
        exportName: 'UnresolvedConsumer',
      },
      { tsconfig },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    const dep = byLocalName(result.value, 'NeverExported');
    expect(dep?.kind).toBe('unresolved');
  });

  it('finds the class through an aliased export name of the target itself', async () => {
    // ClassSource の exportName が実クラス名と違っても(export { Renamed as AliasedService })
    // クラス宣言まで辿って依存を返せること
    const result = await getDependencySources(
      { filePath: exportedPath, exportName: 'AliasedService' },
      { tsconfig },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual([]);
  });

  it('resolves a dependency imported through a re-export-only barrel to its declaring file', async () => {
    // barrel(`export { X } from './y'`)は宣言を持たないので、barrel のまま返すと
    // 宣言を探す側が見つけられない。未デコレートのクラスは実行時の正準化でも救えないため、
    // checker の alias 解決で宣言のあるファイルまで降ろす
    const deps = await getBarrelConsumerDeps();
    expect(byLocalName(deps, 'PlainService')).toEqual({
      kind: 'class',
      localName: 'PlainService',
      source: { filePath: barrelPlainPath, exportName: 'PlainService' },
      line: 15,
    });
  });

  it('keeps the declaring export name when the barrel renames it', async () => {
    const deps = await getBarrelConsumerDeps();
    expect(byLocalName(deps, 'AliasedService')).toEqual({
      kind: 'class',
      localName: 'AliasedService',
      source: { filePath: barrelRenamedPath, exportName: 'PublicRenamedService' },
      line: 16,
    });
  });

  it('resolves a dependency re-exported with `export *`', async () => {
    const deps = await getBarrelConsumerDeps();
    expect(byLocalName(deps, 'StarService')).toEqual({
      kind: 'class',
      localName: 'StarService',
      source: { filePath: barrelStarPath, exportName: 'StarService' },
      line: 17,
    });
  });

  it('resolves a dependency through barrels of barrels', async () => {
    const deps = await getBarrelConsumerDeps();
    expect(byLocalName(deps, 'DeepPlainService')).toEqual({
      kind: 'class',
      localName: 'DeepPlainService',
      source: { filePath: barrelPlainPath, exportName: 'PlainService' },
      line: 18,
    });
  });

  it('reads the constructor of a class asked for through a barrel path', async () => {
    const result = await getDependencySources(
      { filePath: barrelIndexPath, exportName: 'PlainService' },
      { tsconfig },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual([
      {
        kind: 'class',
        localName: 'LeafService',
        source: { filePath: barrelLeafPath, exportName: 'LeafService' },
        line: 9,
      },
    ]);
  });

  it('returns SOURCE_NOT_FOUND for a file outside the program', async () => {
    const result = await getDependencySources(
      { filePath: resolve(__dirname, './no-such-file.ts'), exportName: 'X' },
      { tsconfig },
    );
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('SOURCE_NOT_FOUND');
  });
});

// team-lead 決定(Task 10 remaining-diff cause 5): external な inject() ターゲットは、
// 呼び出し元ファイルの import 文に実際に書かれている export 名(rule a)をそのまま使うべきで、
// 実行時のクラスオブジェクト経由の正準化(resolveClassSource→getClassSource)を試みては
// いけない。正準化は「宣言ファイルの実体」から exportName を再導出するが、その再導出で
// 得られる名前は @zeltjs/kv の MemoryKVAdaptor のような複数名 re-export やバンドラの
// chunk 内部変数名の影響を受けうる(ec-backend の実例: `t` という名前になっていた)。
// ここでは「正準化を試みればほぼ確実に失敗する(無関係な未デコレートクラス)」という
// フィクスチャを使い、正準化が試みられていない(試みられれば kind: 'unresolved' になる
// はずが、そうならず raw の名前で kind: 'class' になる)ことを間接的に証明する。
// リポジトリにコミットしない一時ディレクトリに node_modules 配下のフィクスチャを置く
// (class-source.test.ts の「falls back to the package entry...」テストと同じ手法)
describe('getDependencySources (external targets skip runtime canonicalization, Task 10 remaining-diff cause 5)', () => {
  it('uses the locally-imported export name for an external inject() target, not a runtime-canonicalized one', async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'dep-sources-external-')));
    try {
      const pkgDir = join(base, 'node_modules', 'dep-pkg');
      await mkdir(pkgDir, { recursive: true });
      await writeFile(
        join(pkgDir, 'index.ts'),
        [
          '// バンドラによる re-export の別名化を模す: 実クラスは RealClass という名前で',
          '// 宣言されているが、公開 export 名は AliasedExport(消費側はこちらを import する)。',
          '// decorator-metadata の decorator を一切付けない(正準化が試みられた場合、確実に',
          '// 失敗させて対比するため)',
          'class RealClass {}',
          'export { RealClass as AliasedExport };',
          '',
        ].join('\n'),
      );
      const srcDir = join(base, 'src');
      await mkdir(srcDir, { recursive: true });
      const consumerPath = join(srcDir, 'consumer.ts');
      await writeFile(
        consumerPath,
        [
          "import { AliasedExport } from '../node_modules/dep-pkg/index';",
          '',
          'declare const inject: <T>(cls: new () => T) => T;',
          '',
          'export class Consumer {',
          '  constructor(private readonly dep = inject(AliasedExport)) {}',
          '}',
          '',
        ].join('\n'),
      );
      const tsconfigPath = join(base, 'tsconfig.json');
      await writeFile(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: 'es2022',
            module: 'esnext',
            moduleResolution: 'bundler',
          },
          include: ['src/**/*', 'node_modules/dep-pkg/**/*'],
          exclude: [],
        }),
      );
      clearProgramCache();
      const result = await getDependencySources(
        { filePath: consumerPath, exportName: 'Consumer' },
        { tsconfig: tsconfigPath },
      );
      if (!result.isOk()) throw new Error(`expected ok: ${JSON.stringify(result)}`);
      const dep = result.value.find((d) => d.localName === 'AliasedExport');
      expect(dep).toEqual({
        kind: 'class',
        localName: 'AliasedExport',
        source: { filePath: join(pkgDir, 'index.ts'), exportName: 'AliasedExport' },
        line: 6,
      });
    } finally {
      await rm(base, { recursive: true, force: true });
      clearProgramCache();
    }
  });
});
