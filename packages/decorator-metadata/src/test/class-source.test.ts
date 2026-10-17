import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import { getClassSource, packageFromPath, resolveClassSource } from '../inspect/index';

const fixturePath = resolve(__dirname, './fixtures/class-source/exported.ts');

const packageEntryFields = (fixture: {
  readonly entry: string | null;
  readonly main: string;
  readonly target: string;
  readonly precedingExports: Readonly<Record<string, unknown>>;
}) =>
  fixture.entry === null
    ? { main: fixture.main }
    : { exports: { ...fixture.precedingExports, [fixture.entry]: { import: fixture.target } } };

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

  // @zeltjs/core の @Middleware 相当: createClassDecorator の結果を factory を介さず
  // 直接 export する場合、define トレースは呼び出し元モジュール (direct-decorator.lib.ts)
  // で捕捉され、適用先クラスの定義ファイルを含まない。call トレースから解決する必要がある
  it('resolves ClassSource for a directly-applied (non-factory) class decorator', async () => {
    const { DirectlyDecoratedService } = await import('./fixtures/class-source/direct-decorated');

    const result = await getClassSource(DirectlyDecoratedService);

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({
      filePath: resolve(__dirname, './fixtures/class-source/direct-decorated.ts'),
      exportName: 'DirectlyDecoratedService',
    });
  });

  // sourcemap 適用済みスタックが公開パッケージに同梱されない src パスを指すケース。
  // stable Node の import.meta.resolve は第2引数 (parentURL) を無視するため、
  // parentURL 基準の解決が実際に機能することを検証する。公開 manifest を持つ
  // インストール済みパッケージを、一時ディレクトリに生成して再現する
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

  // team-lead 決定(Task 10 remaining-diff cause 5、残存分): tsdown/rolldown の
  // code splitting は、宣言ファイル自体(共有 chunk)を chunk 間の再エクスポート配線用の
  // 短い内部限定名(例: `t`)で export することがある(実例: @zeltjs/eventbus の
  // MemoryEventBusAdaptor がルートクラスとして発見される際に `t` になっていた)。
  // 宣言ファイルへの stack trace(pos.sourceFile)が依存パッケージの配布物を
  // 指す場合、宣言ファイル自体の export 名を逆引きせず、常にパッケージの公開エントリ
  // 経由で export 名を決めることを検証する。上のテストと同じ手法(実際の decorator
  // 適用フローは組まず、ensureClassMeta に手書きの stack trace を渡して
  // resolveDefinitionPosition の結果を直接コントロールする)で、
  // 宣言ファイル(chunk)と公開エントリ(index)を別ファイルとして用意し、
  // 両者が別の名前でこのクラスを export している状況を再現する
  it.each(
    [
      { layout: 'installed', installPath: 'app/node_modules', entry: '.' },
      { layout: 'workspace', installPath: 'packages', entry: '.' },
      { layout: 'subpath', installPath: 'packages', entry: './feature' },
      { layout: 'workspace legacy', installPath: 'packages', entry: null, contextRequired: true },
      {
        layout: 'wildcard',
        installPath: 'packages',
        entry: './services/*',
        target: './dist/*/index.mjs',
        directory: 'dist/service',
      },
      {
        layout: 'nested wildcard',
        installPath: 'packages',
        entry: './services/*',
        target: './dist/*/index.mjs',
        directory: 'dist/nested/service',
      },
      { layout: 'constant wildcard target', installPath: 'packages', entry: './services/*' },
      {
        layout: 'literal pattern punctuation',
        installPath: 'packages',
        entry: './services/*',
        target: './dist/[literal]+/*/index.mjs',
        directory: 'dist/[literal]+/service',
      },
      {
        layout: 'literal captured dollar',
        installPath: 'packages',
        entry: './services/*',
        target: './dist/*/index.mjs',
        directory: 'dist/service$&',
      },
      {
        layout: 'numeric repeated wildcard trailer',
        installPath: 'packages',
        entry: './services/*',
        target: './dist/*/entry-*2.mjs',
        directory: 'dist/service',
        entryFile: 'entry-service2.mjs',
      },
      {
        layout: 'repeated target wildcard',
        installPath: 'packages',
        entry: './services/*',
        target: './dist/*/entry-*.mjs',
        directory: 'dist/service',
        entryFile: 'entry-service.mjs',
      },
      {
        layout: 'empty wildcard first',
        installPath: 'packages',
        entry: '.',
        precedingExports: { './empty/*': './missing/*.mjs' },
      },
      { layout: 'legacy', installPath: 'app/node_modules', entry: null },
      {
        layout: 'legacy main without dot slash',
        installPath: 'app/node_modules',
        entry: null,
        main: 'dist/index.mjs',
      },
      {
        layout: 'root legacy main',
        installPath: 'app/node_modules',
        entry: null,
        main: 'index.mjs',
        directory: '.',
      },
      {
        layout: 'nested module scope',
        installPath: 'app/node_modules',
        entry: '.',
        moduleScope: true,
      },
      {
        layout: 'blocked first subpath',
        installPath: 'packages',
        entry: './feature',
        precedingExports: { '.': null },
      },
      {
        layout: 'require-only first subpath',
        installPath: 'packages',
        entry: './feature',
        precedingExports: { '.': { require: './dist/index.cjs' } },
      },
    ].map((fixture) => ({
      main: './dist/index.mjs',
      directory: 'dist',
      entryFile: 'index.mjs',
      target: './dist/index.mjs',
      contextRequired: false,
      ...fixture,
    })),
  )('uses the public entry name for a $layout package chunk', async (fixture) => {
    const { installPath } = fixture;
    const base = await realpath(await mkdtemp(join(tmpdir(), 'class-source-chunk-')));
    const applicationRoot = join(base, 'consumer');
    try {
      const pkgRoot = join(base, installPath, 'chunked-pkg');
      const outputRoot = join(pkgRoot, fixture.directory);
      await mkdir(outputRoot, { recursive: true });
      if ('moduleScope' in fixture) {
        await writeFile(join(pkgRoot, 'dist', 'package.json'), JSON.stringify({ type: 'module' }));
      }
      await writeFile(
        join(pkgRoot, 'package.json'),
        JSON.stringify({
          name: 'chunked-pkg',
          type: 'module',
          ...packageEntryFields({
            ...fixture,
            precedingExports: 'precedingExports' in fixture ? fixture.precedingExports : {},
          }),
        }),
      );
      // 宣言ファイル(chunk): 公開エントリとは別のファイルで、chunk 間配線用の
      // 短い内部限定名 `t` としてこのクラスを export する(rolldown の shared chunk と同じ形)
      const chunkPath = join(outputRoot, 'chunk.mjs');
      await writeFile(chunkPath, 'export class RealClass {}\nexport { RealClass as t };\n');
      // 公開エントリ: chunk からクラスを受け取り、ユーザー向けの名前で re-export する
      const entryPath = join(outputRoot, fixture.entryFile);
      await writeFile(entryPath, "export { t as PublicName } from './chunk.mjs';\n");

      const entryModule: unknown = await import(pathToFileURL(entryPath).href);
      const { PublicName } = entryModule as { PublicName: new () => object };
      const { ensureClassMeta, CaptureStackError } = await import('../runtime/index');

      // stack trace は宣言ファイル(chunk.mjs、公開エントリではない)を指す
      // (実際の tsdown/rolldown ビルドで、クラス宣言自体は shared chunk にあり、
      // エントリはそれを re-export するだけ、という構造を再現する)
      const defineError = new CaptureStackError();
      defineError.stack = [
        'CaptureStackError: Capture stack trace',
        `    at captureStackTrace (${resolve(__dirname, '../runtime/trace.lib.ts')}:16:17)`,
        `    at ${chunkPath}:1:1`,
      ].join('\n');
      ensureClassMeta(PublicName, { _brand: 'StackTrace', error: defineError });

      expect(packageFromPath(chunkPath, { applicationRoot })?.name).toBe('chunked-pkg');
      expect(packageFromPath(chunkPath, { applicationRoot: pkgRoot })).toBeUndefined();
      const linkedRoot = join(applicationRoot, 'node_modules', 'chunked-pkg');
      await mkdir(dirname(linkedRoot), { recursive: true });
      await symlink(pkgRoot, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
      expect(packageFromPath(chunkPath, { applicationRoot: linkedRoot })).toBeUndefined();
      if (fixture.contextRequired) {
        expect(createRequire(join(applicationRoot, 'package.json')).resolve('chunked-pkg')).toBe(
          entryPath,
        );
      }
      const result = await getClassSource(PublicName, { applicationRoot });

      // chunk.mjs 自身の export 名(`t`)ではなく、公開エントリ(index.mjs)の
      // export 名(`PublicName`)が使われることを確認する
      expect(result).toEqual(ok({ filePath: entryPath, exportName: 'PublicName' }));
      if (!fixture.contextRequired) {
        const withoutContext = await getClassSource(PublicName);
        expect(withoutContext).toEqual(result);
      }
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it.each([
    { name: 'root main', entry: 'index.mjs', main: './index.mjs' },
    { name: 'source main', entry: 'src/index.mjs', main: 'src/index.mjs' },
    { name: 'root export', entry: 'index.mjs', exports: { '.': './index.mjs' } },
  ])('resolves application source without context for $name', async (fixture) => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'class-source-app-main-')));
    try {
      await mkdir(join(root, 'src'));
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({
          name: 'source-app',
          type: 'module',
          ...('main' in fixture ? { main: fixture.main } : { exports: fixture.exports }),
        }),
      );
      await writeFile(join(root, fixture.entry), 'export class EntryClass {}\n');
      const source = join(root, 'src', 'local.mjs');
      await writeFile(source, 'export class LocalClass {}\n');
      const loaded = await resolveClassSource({ filePath: source, exportName: 'LocalClass' });
      expect(loaded.isOk()).toBe(true);
      if (loaded.isErr()) return;
      const { ensureClassMeta, CaptureStackError } = await import('../runtime/index');
      const trace = new CaptureStackError();
      trace.stack = [
        'CaptureStackError: Capture stack trace',
        `    at captureStackTrace (${resolve(__dirname, '../runtime/trace.lib.ts')}:16:17)`,
        `    at ${source}:1:1`,
      ].join('\n');
      ensureClassMeta(loaded.value, { _brand: 'StackTrace', error: trace });

      expect(packageFromPath(source)).toBeUndefined();
      const result = await getClassSource(loaded.value);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({ filePath: source, exportName: 'LocalClass' });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    { failure: 'missing dependency', source: "import './missing-dependency.mjs';" },
    { failure: 'invalid syntax', source: 'export class {' },
  ])('preserves a resolved entry import failure: $failure', async ({ source }) => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'class-source-broken-entry-')));
    try {
      await mkdir(join(base, 'dist'));
      await writeFile(
        join(base, 'package.json'),
        JSON.stringify({
          name: 'broken-entry-pkg',
          type: 'module',
          exports: { '.': './dist/broken.mjs', './feature': './dist/index.mjs' },
        }),
      );
      await writeFile(join(base, 'dist', 'broken.mjs'), source);
      const entryPath = join(base, 'dist', 'index.mjs');
      await writeFile(entryPath, 'export class PublicName {}');
      const loaded = await resolveClassSource({ filePath: entryPath, exportName: 'PublicName' });
      expect(loaded.isOk()).toBe(true);
      if (!loaded.isOk()) return;
      const PublicName = loaded.value;
      const { ensureClassMeta, CaptureStackError } = await import('../runtime/index');
      const defineError = new CaptureStackError();
      defineError.stack = [
        'CaptureStackError: Capture stack trace',
        `    at captureStackTrace (${resolve(__dirname, '../runtime/trace.lib.ts')}:16:17)`,
        `    at ${entryPath}:1:1`,
      ].join('\n');
      ensureClassMeta(PublicName, { _brand: 'StackTrace', error: defineError });

      const result = await getClassSource(PublicName);

      expect(result.isErr()).toBe(true);
      if (!result.isErr()) return;
      expect(result.error.code).toBe('MODULE_LOAD_FAILED');
      expect(result.error.message).toContain('broken.mjs');
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

    // call スタック: デコレータ適用時。wrapper は現れず、機構の内部依存 (ts-pattern) が挟まる。
    // match().with() の呼び出し元は常に decorator-metadata 自身のディスパッチ関数なので、
    // ts-pattern のフレームの直後には機構フレーム (dispatch) がもう一度現れる
    const callError = new CaptureStackError();
    callError.stack = [
      'CaptureStackError: Capture stack trace',
      '    at captureStackTrace (/repo/node_modules/@zeltjs/decorator-metadata/dist/index.js:10:5)',
      '    at adaptClassContext (/repo/node_modules/@zeltjs/decorator-metadata/dist/index.js:22:5)',
      '    at I.with (/repo/node_modules/ts-pattern/dist/index.js:1:6833)',
      '    at dispatch (/repo/node_modules/@zeltjs/decorator-metadata/dist/index.js:25:5)',
      '    at /repo/node_modules/@zeltjs/eventbus/dist/index-chunk.js:7:1',
    ].join('\n');

    const pos = resolveDefinitionPosition({
      _brand: 'StackTrace',
      error: defineError,
      callError,
    });

    expect(pos?.sourceFile).toBe('/repo/node_modules/@zeltjs/eventbus/dist/index-chunk.js');
  });

  // ts-pattern の match/with dispatch が内部呼び出しをもう1段挟む (2 frame サンドイッチ) 将来の
  // バージョンを模した合成スタック。1 frame 先読みしかしない実装だと、機構フレームに戻る前の
  // 2つ目の ts-pattern 内部フレームを誤って「ユーザーコード」候補として解決してしまう
  it('resolves through a 2-frame machinery sandwich (bounded lookahead)', async () => {
    const { resolveDefinitionPosition } = await import('../inspect/index');
    const { CaptureStackError } = await import('../runtime/index');

    const defineError = new CaptureStackError();
    defineError.stack = [
      'CaptureStackError: Capture stack trace',
      '    at captureStackTrace (/repo/node_modules/@zeltjs/decorator-metadata/dist/index.js:10:5)',
      '    at createClassDecorator (/repo/node_modules/@zeltjs/decorator-metadata/dist/index.js:20:5)',
      '    at createInjectableClassDecorator (/repo/node_modules/@zeltjs/core/dist/chunk.js:30:5)',
      '    at /repo/node_modules/@zeltjs/eventbus/dist/index-chunk.js:7:1',
    ].join('\n');

    const callError = new CaptureStackError();
    callError.stack = [
      'CaptureStackError: Capture stack trace',
      '    at captureStackTrace (/repo/node_modules/@zeltjs/decorator-metadata/dist/index.js:10:5)',
      '    at adaptClassContext (/repo/node_modules/@zeltjs/decorator-metadata/dist/index.js:22:5)',
      '    at I.with (/repo/node_modules/ts-pattern/dist/index.js:1:6833)',
      '    at innerHelper (/repo/node_modules/ts-pattern/dist/index.js:2:100)',
      '    at dispatch (/repo/node_modules/@zeltjs/decorator-metadata/dist/index.js:25:5)',
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
