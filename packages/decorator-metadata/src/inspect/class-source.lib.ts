import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolve } from 'import-meta-resolve';
import type { ResultAsync } from 'neverthrow';
import { err, errAsync, ok, okAsync, Result, ResultAsync as ResultAsyncCtor } from 'neverthrow';
import { match, P } from 'ts-pattern';

import { getInternalClassMetadata } from '../runtime/index';
import type { ClassSource, InspectError } from './inspect.types';
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
type SourceContext = { readonly applicationRoot?: string };

const packageManifest = (
  root: string,
):
  | {
      readonly name: string;
      readonly exports: unknown;
      readonly main: string | undefined;
    }
  | undefined => {
  const manifest: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return match(manifest)
    .with({ name: P.string, exports: P.optional(P._), main: P.optional(P.string) }, (value) => ({
      name: value.name,
      exports: value.exports,
      main: value.main,
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

const ownsDistributionFile = (root: string, file: string, exports: unknown): boolean =>
  !existsSync(file) ||
  exportTargets(exports).some(
    (target) => target.startsWith('./') && isWithin(dirname(resolvePath(root, target)), file),
  );

const packageOwnerOf = (file: string) => {
  let root = dirname(file);
  while (root !== dirname(root)) {
    if (existsSync(join(root, 'package.json'))) {
      const manifest = packageManifest(root);
      return manifest === undefined ? undefined : { root, ...manifest };
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
    ownsDistributionFile(owner.root, file, { exports: owner.exports, main: owner.main })
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
const packageSpecifiers = (pkg: PackageOwner): readonly string[] => {
  const manifest = packageManifest(pkg.root);
  if (manifest === undefined) return [];
  const exports = manifest.exports;
  if (typeof exports !== 'object' || exports === null) return [pkg.name];
  const keys = Object.keys(exports);
  if (!keys.some((key) => key.startsWith('.'))) return [pkg.name];
  return keys.filter((key) => !key.includes('*')).map((key) => pkg.name + key.slice(1));
};

const packageEntrySource = (
  pkg: PackageOwner,
  cls: AnyClass,
  original: InspectError,
  specifiers: readonly string[] = packageSpecifiers(pkg),
): ResultAsync<ClassSource, InspectError> => {
  const [specifier, ...remaining] = specifiers;
  if (specifier === undefined) return errAsync(original);
  const parentUrl = pathToFileURL(join(pkg.root, 'package.json')).href;
  const entry = Result.fromThrowable(
    () => fileURLToPath(resolve(specifier, parentUrl)),
    (cause): InspectError => ({
      code: 'MODULE_LOAD_FAILED',
      message: `Cannot resolve ${specifier}: ${String(cause)}`,
    }),
  )();
  return entry
    .asyncAndThen((path) => classSourceFromModule(path, cls))
    .orElse((error) =>
      error.code === 'EXPORT_NOT_FOUND'
        ? packageEntrySource(pkg, cls, original, remaining)
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
