import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve as resolvePath,
  sep,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolve } from 'import-meta-resolve';
import type { ResultAsync } from 'neverthrow';
import { err, errAsync, ok, okAsync, Result, ResultAsync as ResultAsyncCtor } from 'neverthrow';
import { match, P } from 'ts-pattern';

import { getInternalClassMetadata } from '../runtime/index';
import type { ClassSource, InspectError, SourceContext } from './inspect.types';
import { resolveDefinitionPosition } from './position.lib';

type AnyClass = new (...args: never[]) => unknown;
type ModuleExports = Record<string, unknown>;

// ESM の module namespace object は常に object。Record への絞り込みだけ行う
const toModuleExports = (value: unknown): ModuleExports =>
  typeof value === 'object' && value !== null ? (value as ModuleExports) : {};

type ImportOutcome =
  | { ok: true; readonly value: ModuleExports }
  | { ok: false; readonly message: string };

// import() は動的な式のため fromPromise に直接渡せず (restrict-neverthrow-from-promise)、
// reject しない Promise に自前で畳んでから fromSafePromise で持ち上げる
const importOutcome = async (url: string): Promise<ImportOutcome> => {
  try {
    const mod: unknown = await import(url);
    return { ok: true, value: toModuleExports(mod) };
  } catch (error) {
    return { ok: false, message: String(error) };
  }
};

const importModule = (filePath: string): ResultAsync<ModuleExports, InspectError> =>
  ResultAsyncCtor.fromSafePromise(importOutcome(pathToFileURL(filePath).href)).andThen((outcome) =>
    outcome.ok
      ? ok(outcome.value)
      : err({
          code: 'MODULE_LOAD_FAILED' as const,
          message: `Failed to import ${filePath}: ${outcome.message}`,
        }),
  );

// export 名はクラス名と一致するとは限らない (`export { A as B }`) ため、
// モジュールの export を identity 比較で逆引きする。同一クラスが複数名で
// export されている場合はクラス名と同名の export を優先する
const findExportName = (mod: ModuleExports, cls: AnyClass): string | undefined => {
  const names = Object.keys(mod).filter((name) => mod[name] === cls);
  if (names.length === 0) return undefined;
  return names.find((name) => name === cls.name) ?? names[0];
};

const classSourceFromModule = (
  filePath: string,
  cls: AnyClass,
): ResultAsync<ClassSource, InspectError> =>
  importModule(filePath).andThen((mod) => {
    const exportName = findExportName(mod, cls);
    if (exportName === undefined) {
      return errAsync<ClassSource, InspectError>({
        code: 'EXPORT_NOT_FOUND',
        message: `Class ${cls.name} is not exported from ${filePath}`,
      });
    }
    return okAsync<ClassSource, InspectError>({ filePath, exportName });
  });

type PackageOwner = { readonly root: string; readonly name: string };

const packageManifest = (
  root: string,
):
  | {
      readonly name: string;
      readonly exports: unknown;
    }
  | undefined => {
  const manifest: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return match(manifest)
    .with({ name: P.string, exports: P.optional(P._) }, (value) => ({
      name: value.name,
      exports: value.exports,
    }))
    .otherwise(() => undefined);
};

const exportTargets = (value: unknown): readonly string[] => {
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object' || value === null) return [];
  return Object.values(value).flatMap(exportTargets);
};

const isWithin = (root: string, file: string): boolean => {
  const path = relative(root, file);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
};

const canonicalPath = (file: string): string =>
  existsSync(file) ? realpathSync(file) : resolvePath(file);

const distributionDirectory = (root: string, target: string): string => {
  const path = relative(root, target);
  const wildcard = path.indexOf('*');
  return wildcard < 0
    ? dirname(target)
    : resolvePath(root, path.slice(0, path.lastIndexOf(sep, wildcard) + 1));
};

const ownsDistributionFile = (root: string, file: string, exports: unknown): boolean =>
  !existsSync(file) ||
  exportTargets(exports).some((target) => {
    if (!target.startsWith('./')) return false;
    const entry = resolvePath(root, target);
    const directory = distributionDirectory(root, entry);
    return file === entry || (directory !== root && isWithin(directory, file));
  });

const packageOwnerOf = (file: string) => {
  let root = dirname(file);
  while (root !== dirname(root)) {
    if (existsSync(join(root, 'package.json'))) {
      const manifest = packageManifest(root);
      if (manifest !== undefined) return { root, ...manifest };
    }
    root = dirname(root);
  }
  return undefined;
};

// Package identity comes from manifests, including workspace links. The caller's
// application boundary distinguishes its own source from dependency source.
export const packageFromPath = (
  sourceFile: string,
  context: SourceContext = {},
): PackageOwner | undefined => {
  const file = canonicalPath(sourceFile);
  const applicationRoot =
    context.applicationRoot === undefined ? undefined : canonicalPath(context.applicationRoot);
  const owner = packageOwnerOf(file);
  if (owner === undefined) return undefined;
  if (
    applicationRoot !== undefined &&
    isWithin(applicationRoot, file) &&
    isWithin(owner.root, applicationRoot)
  )
    return undefined;
  return applicationRoot !== undefined ||
    owner.root.split(sep).includes('node_modules') ||
    ownsDistributionFile(owner.root, file, owner.exports)
    ? { root: owner.root, name: owner.name }
    : undefined;
};

const TYPES_PREFIX = '@types/';

// `@types/foo` は型のみのパッケージで実行時の実体は `foo` 側にある。パッケージ名として
// 報告する際は常に剥がす(get-call-sites.lib.ts の external 判定・build-graph.lib.ts の
// ExternalNode 生成の両方で同じ正規化が必要なため、ここに集約する。レビュー再指摘11)
export const normalizePackageName = (name: string): string =>
  name.startsWith(TYPES_PREFIX) ? name.slice(TYPES_PREFIX.length) : name;

// sourcemap 適用済みスタックは公開パッケージに同梱されない src パスを指すことがある。
// その場合はパッケージの self-reference 解決でエントリモジュールに落とし、
// エントリの export から ClassSource を作る (依存側の正準化も同じ経路に収束する)。
// stable Node の import.meta.resolve は第2引数 (parentURL) を無視して自パッケージ
// 基準の解決になるため、Node の resolver を移植した import-meta-resolve を使う
// exports のないパッケージは self-reference を使えないため directory resolution を使う。
// 公開候補は遅延列挙し、先に見つかったエントリより後のモジュールはロードしない。
const packageExportKeys = (exports: unknown): readonly string[] => {
  if (typeof exports !== 'object' || exports === null) return ['.'];
  const keys = Object.keys(exports);
  return keys.some((key) => key.startsWith('.')) ? keys : ['.'];
};

const resolveExportEntry = (pkg: PackageOwner, specifier: string): Result<string, InspectError> =>
  Result.fromThrowable(
    () => fileURLToPath(resolve(specifier, pathToFileURL(join(pkg.root, 'package.json')).href)),
    (cause): InspectError => ({
      code: 'MODULE_LOAD_FAILED',
      message: `Cannot resolve ${specifier}: ${String(cause)}`,
    }),
  )();

const packageFiles = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules') return [];
    const file = join(directory, entry.name);
    return entry.isDirectory() ? packageFiles(file) : [file];
  });

const exportPatternMatcher = (pattern: string): ((file: string) => string | undefined) => {
  const parts: readonly string[] = pattern.split('*');
  const wildcards = parts.length - 1;
  const literalLength = pattern.length - wildcards;
  const offset = pattern.indexOf('*');
  return (file) => {
    if (wildcards === 0) return undefined;
    // Every '*' substitutes the same subpath, whose length follows from the filename.
    const length = (file.length - literalLength) / wildcards;
    if (length < 0 || !Number.isInteger(length)) return undefined;
    const capture = file.slice(offset, offset + length);
    return parts.join(capture) === file ? capture : undefined;
  };
};

const readExportPatternFiles = (
  root: string,
  pattern: string,
): Result<readonly string[], InspectError> =>
  Result.fromThrowable(() => packageFiles(distributionDirectory(root, pattern)))().orElse((cause) =>
    match(cause)
      .with({ code: P.union('ENOENT', 'ENOTDIR') }, () => ok<readonly string[], InspectError>([]))
      .otherwise(() =>
        err<readonly string[], InspectError>({
          code: 'MODULE_LOAD_FAILED',
          message: `Cannot enumerate ${pattern}: ${String(cause)}`,
        }),
      ),
  );

const runtimeExtensions = new Set([
  '',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.mts',
  '.cts',
  '.jsx',
  '.tsx',
  '.node',
]);

const isRuntimeClassEntry = (entry: string): boolean =>
  runtimeExtensions.has(extname(entry)) && !/\.d\.[cm]?ts$/.test(entry);

const needsExportExpansion = (specifier: string, target: string): boolean =>
  specifier.includes('*') && target.includes('*') && isRuntimeClassEntry(target);

function* exportEntries(
  pkg: PackageOwner,
  specifier: string,
): Generator<Result<string, InspectError>, void> {
  const entry = resolveExportEntry(pkg, specifier);
  if (entry.isErr()) return;
  const target = relative(pkg.root, entry.value);
  if (!needsExportExpansion(specifier, target)) {
    yield entry;
    return;
  }
  const files = readExportPatternFiles(pkg.root, entry.value);
  if (files.isErr()) {
    yield err(files.error);
    return;
  }
  const matcher = exportPatternMatcher(target);
  for (const file of files.value.slice().sort()) {
    const capture = matcher(relative(pkg.root, file));
    if (capture === undefined) continue;
    const subpath = capture.split(sep).map(encodeURIComponent).join('/');
    const resolved = resolveExportEntry(
      pkg,
      specifier.replace('*', () => subpath),
    );
    if (resolved.isOk()) yield resolved;
  }
}

function* packageEntries(pkg: PackageOwner): Generator<Result<string, InspectError>, void> {
  const manifest = packageManifest(pkg.root);
  if (manifest === undefined) return;
  if (manifest.exports === undefined || manifest.exports === null) {
    const entry = Result.fromThrowable(
      () => createRequire(join(pkg.root, 'package.json')).resolve(pkg.root),
      (cause): InspectError => ({
        code: 'MODULE_LOAD_FAILED',
        message: `Cannot resolve ${pkg.root}: ${String(cause)}`,
      }),
    )();
    if (entry.isOk()) yield entry;
    return;
  }
  for (const key of packageExportKeys(manifest.exports)) {
    yield* exportEntries(pkg, pkg.name + key.slice(1));
  }
}

const packageEntrySource = (
  pkg: PackageOwner,
  cls: AnyClass,
  original: InspectError,
  entries: ReturnType<typeof packageEntries> = packageEntries(pkg),
): ResultAsync<ClassSource, InspectError> => {
  const candidate = entries.next();
  if (candidate.done) return errAsync(original);
  const entry = candidate.value;
  if (entry.isErr()) return errAsync(entry.error);
  if (!isRuntimeClassEntry(entry.value)) return packageEntrySource(pkg, cls, original, entries);
  return classSourceFromModule(entry.value, cls).orElse((error) =>
    error.code === 'EXPORT_NOT_FOUND'
      ? packageEntrySource(pkg, cls, original, entries)
      : errAsync(error),
  );
};

export const getClassSource = (
  cls: AnyClass,
  context: SourceContext = {},
): ResultAsync<ClassSource, InspectError> => {
  const internal = getInternalClassMetadata(cls);
  if (!internal?.trace) {
    return errAsync({
      code: 'NO_METADATA',
      message: `No decorator metadata found for class ${cls.name}`,
    });
  }
  const pos = resolveDefinitionPosition(internal.trace);
  if (!pos) {
    return errAsync({
      code: 'POSITION_INVALID',
      message: `No source position captured for class ${cls.name}`,
    });
  }
  // Published entries retain public names when bundlers rename shared chunk exports.
  const pkg = packageFromPath(pos.sourceFile, context);
  if (pkg !== undefined) {
    return packageEntrySource(pkg, cls, {
      code: 'EXPORT_NOT_FOUND',
      message: `Class ${cls.name} is not exported from the entry point of the package declaring ${pos.sourceFile}`,
    });
  }
  return classSourceFromModule(pos.sourceFile, cls);
};

export const resolveClassSource = (source: ClassSource): ResultAsync<AnyClass, InspectError> =>
  importModule(source.filePath).andThen((mod) => {
    const value = mod[source.exportName];
    if (typeof value !== 'function') {
      return errAsync<AnyClass, InspectError>({
        code: 'EXPORT_NOT_FOUND',
        message: `Export ${source.exportName} in ${source.filePath} is missing or not a class`,
      });
    }
    return okAsync<AnyClass, InspectError>(value as AnyClass);
  });
