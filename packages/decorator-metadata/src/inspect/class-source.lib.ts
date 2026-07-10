import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolve } from 'import-meta-resolve';
import type { ResultAsync } from 'neverthrow';
import { err, errAsync, ok, okAsync, ResultAsync as ResultAsyncCtor } from 'neverthrow';

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

// 定義ファイルパスから所属パッケージ (node_modules 配下) を割り出す
const packageFromPath = (
  sourceFile: string,
): { readonly root: string; readonly name: string } | undefined => {
  const normalized = sourceFile.replace(/\\/g, '/');
  const marker = '/node_modules/';
  const index = normalized.lastIndexOf(marker);
  if (index === -1) return undefined;
  const segments = normalized.slice(index + marker.length).split('/');
  const name = segments[0]?.startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];
  if (name === undefined || name === '') return undefined;
  return { root: `${normalized.slice(0, index)}${marker}${name}`, name };
};

// sourcemap 適用済みスタックは公開パッケージに同梱されない src パスを指すことがある。
// その場合はパッケージの self-reference 解決でエントリモジュールに落とし、
// エントリの export から ClassSource を作る (依存側の正準化も同じ経路に収束する)。
// stable Node の import.meta.resolve は第2引数 (parentURL) を無視して自パッケージ
// 基準の解決になるため、Node の resolver を移植した import-meta-resolve を使う
const packageEntryFallback = (
  sourceFile: string,
  cls: AnyClass,
  original: InspectError,
): ResultAsync<ClassSource, InspectError> => {
  const pkg = packageFromPath(sourceFile);
  if (!pkg) return errAsync(original);
  try {
    const parentUrl = pathToFileURL(`${pkg.root}/package.json`).href;
    const entry = fileURLToPath(resolve(pkg.name, parentUrl));
    return classSourceFromModule(entry, cls);
  } catch {
    return errAsync(original);
  }
};

export const getClassSource = (cls: AnyClass): ResultAsync<ClassSource, InspectError> => {
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
  return classSourceFromModule(pos.sourceFile, cls).orElse((error) =>
    error.code === 'MODULE_LOAD_FAILED'
      ? packageEntryFallback(pos.sourceFile, cls, error)
      : errAsync(error),
  );
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
