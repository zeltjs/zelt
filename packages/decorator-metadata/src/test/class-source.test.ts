import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getClassSource, resolveClassSource } from '../inspect/index';

const fixturePath = resolve(__dirname, './fixtures/class-source/exported.ts');

describe('getClassSource', () => {
  it('converts a decorated exported class to its ClassSource', async () => {
    const { ExportedService } = await import('./fixtures/class-source/exported');

    const result = await getClassSource(ExportedService);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({ filePath: fixturePath, exportName: 'ExportedService' });
  });

  it('uses the export name, not the class name, for aliased exports', async () => {
    const { AliasedService } = await import('./fixtures/class-source/exported');

    const result = await getClassSource(AliasedService);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value.exportName).toBe('AliasedService');
  });

  it('returns EXPORT_NOT_FOUND for a decorated class that is not exported', async () => {
    const { hiddenRef } = await import('./fixtures/class-source/exported');
    const hidden = hiddenRef();

    const result = await getClassSource(hidden as new () => object);

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('EXPORT_NOT_FOUND');
  });

  it('returns NO_METADATA for a class without decorator metadata', async () => {
    class Plain {}

    const result = await getClassSource(Plain);

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('NO_METADATA');
  });

  // sourcemap 適用済みスタックが公開パッケージに同梱されない src パスを指すケース。
  // stable Node の import.meta.resolve は第2引数 (parentURL) を無視するため、
  // parentURL 基準の解決が実際に機能することを検証する。fallback はパスの
  // /node_modules/ マーカーでパッケージルートを検出するため、リポジトリに
  // node_modules 配下の fixture を置かず tmpdir に実行時生成する
  it('falls back to the package entry when the recorded source path is not shipped', async () => {
    // macOS では tmpdir が symlink (/var -> /private/var) のため realpath で正規化する
    const base = await realpath(await mkdtemp(join(tmpdir(), 'class-source-fallback-')));
    try {
      const pkgRoot = join(base, 'node_modules', 'fallback-pkg');
      await mkdir(join(pkgRoot, 'dist'), { recursive: true });
      await writeFile(
        join(pkgRoot, 'package.json'),
        JSON.stringify({
          name: 'fallback-pkg',
          type: 'module',
          exports: { '.': { import: './dist/index.mjs' } },
        }),
      );
      const entryPath = join(pkgRoot, 'dist', 'index.mjs');
      await writeFile(entryPath, 'export class PackagedService {}\n');

      const entryModule: unknown = await import(pathToFileURL(entryPath).href);
      const { PackagedService } = entryModule as { PackagedService: new () => object };
      const { ensureClassMeta, CaptureStackError } = await import('../runtime/index');

      const missingSrc = join(pkgRoot, 'src', 'index.ts');
      const defineError = new CaptureStackError();
      defineError.stack = [
        'CaptureStackError: Capture stack trace',
        `    at captureStackTrace (${resolve(__dirname, '../runtime/trace.lib.ts')}:16:17)`,
        `    at ${missingSrc}:1:1`,
      ].join('\n');
      ensureClassMeta(PackagedService, { _brand: 'StackTrace', error: defineError });

      const result = await getClassSource(PackagedService);

      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;
      expect(result.value).toEqual({ filePath: entryPath, exportName: 'PackagedService' });
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe('resolveClassSource', () => {
  it('round-trips: resolving a ClassSource returns the identical class object', async () => {
    const { ExportedService } = await import('./fixtures/class-source/exported');
    const source = await getClassSource(ExportedService);
    expect(source.isOk()).toBe(true);
    if (!source.isOk()) return;

    const result = await resolveClassSource(source.value);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toBe(ExportedService);
  });

  it('returns MODULE_LOAD_FAILED for a non-existent file', async () => {
    const result = await resolveClassSource({
      filePath: resolve(__dirname, './fixtures/class-source/no-such-file.ts'),
      exportName: 'Nope',
    });

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('MODULE_LOAD_FAILED');
  });

  it('returns EXPORT_NOT_FOUND when the export name does not exist', async () => {
    const result = await resolveClassSource({ filePath: fixturePath, exportName: 'Missing' });

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('EXPORT_NOT_FOUND');
  });
});

describe('resolveDefinitionPosition', () => {
  it('returns node_modules definition sites and excludes factory wrappers via stack diff', async () => {
    const { resolveDefinitionPosition } = await import('../inspect/index');
    const { CaptureStackError } = await import('../runtime/index');

    // define スタック: factory 呼び出し。core の wrapper フレームを含む
    const defineError = new CaptureStackError();
    defineError.stack = [
      'CaptureStackError: Capture stack trace',
      '    at captureStackTrace (/repo/node_modules/@zeltjs/decorator-metadata/dist/index.js:10:5)',
      '    at createClassDecorator (/repo/node_modules/@zeltjs/decorator-metadata/dist/index.js:20:5)',
      '    at createInjectableClassDecorator (/repo/node_modules/@zeltjs/core/dist/chunk.js:30:5)',
      '    at /repo/node_modules/@zeltjs/eventbus/dist/index-chunk.js:7:1',
    ].join('\n');

    // call スタック: デコレータ適用時。wrapper は現れず、機構の内部依存 (ts-pattern) が挟まる
    const callError = new CaptureStackError();
    callError.stack = [
      'CaptureStackError: Capture stack trace',
      '    at captureStackTrace (/repo/node_modules/@zeltjs/decorator-metadata/dist/index.js:10:5)',
      '    at decorate (/repo/node_modules/@zeltjs/decorator-metadata/dist/index.js:22:5)',
      '    at I.with (/repo/node_modules/ts-pattern/dist/index.js:1:6833)',
      '    at /repo/node_modules/@zeltjs/eventbus/dist/index-chunk.js:7:1',
    ].join('\n');

    const pos = resolveDefinitionPosition({
      _brand: 'StackTrace',
      error: defineError,
      callError,
    });

    expect(pos?.sourceFile).toBe('/repo/node_modules/@zeltjs/eventbus/dist/index-chunk.js');
  });
});
