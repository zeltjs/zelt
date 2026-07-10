import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { StackTrace } from '../runtime/index';

export type Position = {
  readonly sourceFile: string;
  readonly line: number;
  readonly column: number;
};

export type ResolvePositionOptions = {
  readonly isFrameworkPath?: (path: string) => boolean;
};

const findPackageRoot = (start: string): string => {
  let dir = dirname(start);
  while (dir !== dirname(dir)) {
    if (existsSync(`${dir}/package.json`)) return dir;
    dir = dirname(dir);
  }
  return dir;
};

const PACKAGE_ROOT = findPackageRoot(fileURLToPath(import.meta.url)).replace(/\\/g, '/');

const isWithinPackageRoot = (path: string, packageRoot: string): boolean =>
  path === packageRoot || path.startsWith(`${packageRoot}/`);

const isPackageTestPath = (path: string, packageRoot: string): boolean => {
  const relative = path.slice(packageRoot.length + 1);
  return relative.startsWith('src/test/') || relative.startsWith('dist/test/');
};

const defaultIsFrameworkPath = (path: string): boolean => {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.includes('/node_modules/')) return true;
  if (normalized.startsWith('node:')) return true;
  if (!isWithinPackageRoot(normalized, PACKAGE_ROOT)) return false;
  return !isPackageTestPath(normalized, PACKAGE_ROOT);
};

const TRANSPILER_HELPER_NAMES = new Set([
  'applyClassDecs',
  '__decorate',
  '_decorate',
  'applyDecs',
  'applyDecs2305',
  'memberDec',
  'applyMemberDec',
  'applyMemberDecs',
  'applyDecs2203R',
  '_apply_decs_2203_r',
]);

const isTranspilerHelperFrame = (line: string): boolean => {
  if (line.includes('[as ')) return true;

  const match = line.match(/^\s+at\s+([^\s(]+)/);
  if (!match?.[1]) return false;
  const name = match[1].split('.').pop() ?? '';
  return TRANSPILER_HELPER_NAMES.has(name);
};

const normalizeStackFilePath = (file: string): string => {
  if (!file.startsWith('file://')) return file;
  try {
    return fileURLToPath(file);
  } catch {
    return file;
  }
};

const tryParseMatch = (
  match: RegExpMatchArray | null,
  isFrameworkPath: (path: string) => boolean,
): Position | undefined => {
  if (!match) return undefined;
  const [, rawFile, lineNum, colNum] = match;
  if (!rawFile || !lineNum || !colNum) return undefined;
  const file = normalizeStackFilePath(rawFile);
  if (isFrameworkPath(file)) return undefined;
  return {
    sourceFile: file,
    line: parseInt(lineNum, 10),
    column: parseInt(colNum, 10),
  };
};

const parsePositionFromStackLine = (
  line: string,
  isFrameworkPath: (path: string) => boolean,
): Position | undefined => {
  const parenMatch = line.match(/\(([^)]+):(\d+):(\d+)\)/);
  const parenResult = tryParseMatch(parenMatch, isFrameworkPath);
  if (parenResult) return parenResult;

  const atMatch = line.match(/at\s+([^\s]+):(\d+):(\d+)/);
  return tryParseMatch(atMatch, isFrameworkPath);
};

const isAnonymousPathFrame = (line: string): boolean =>
  /^\s+at\s+\//.test(line) || /^\s+at\s+[a-zA-Z]:\\/.test(line);

const extractFilePath = (line: string): string | undefined => {
  const parenMatch = line.match(/\(([^)]+):\d+:\d+\)/);
  if (parenMatch?.[1]) return normalizeStackFilePath(parenMatch[1]);
  const atMatch = line.match(/at\s+([^\s]+):\d+:\d+/);
  return atMatch?.[1] ? normalizeStackFilePath(atMatch[1]) : undefined;
};

const extractOutsidePackageFiles = (
  stack: string,
  isFrameworkPath: (path: string) => boolean,
): Set<string> => {
  const lines = stack.split('\n').slice(1);
  const files = new Set<string>();
  for (const line of lines) {
    const file = extractFilePath(line);
    if (!file) continue;
    const normalized = file.replace(/\\/g, '/');
    if (isFrameworkPath(normalized)) continue;
    files.add(normalized);
  }
  return files;
};

const diffOutsidePackageFiles = (
  defineStack: string,
  callStack: string,
  isFrameworkPath: (path: string) => boolean,
): readonly string[] => {
  const callFiles = extractOutsidePackageFiles(callStack, isFrameworkPath);
  const defineFiles = extractOutsidePackageFiles(defineStack, isFrameworkPath);
  const wrapperFiles: string[] = [];
  for (const file of defineFiles) {
    if (!callFiles.has(file)) wrapperFiles.push(file);
  }
  return wrapperFiles;
};

const findFirstUserPosition = (
  stack: string,
  isFrameworkPath: (path: string) => boolean,
): Position | undefined => {
  const lines = stack.split('\n').slice(2);
  let prevWasHelperFrame = false;
  for (const line of lines) {
    if (!line) continue;
    if (isTranspilerHelperFrame(line)) {
      prevWasHelperFrame = true;
      continue;
    }
    if (prevWasHelperFrame && isAnonymousPathFrame(line)) {
      prevWasHelperFrame = true;
      continue;
    }
    prevWasHelperFrame = false;
    const pos = parsePositionFromStackLine(line, isFrameworkPath);
    if (pos) return pos;
  }
  return undefined;
};

// define スタック（デコレータ factory 呼び出し時）にだけ現れるファイルは、factory を
// 包む wrapper（例: core の createInjectableClassDecorator）とみなして除外対象に加える
const buildIsExcludedPath = (
  trace: StackTrace,
  baseIsFrameworkPath: (path: string) => boolean,
): ((path: string) => boolean) => {
  const defineStack = trace.error.stack;
  const callStack = trace.callError?.stack;
  if (!defineStack || !callStack) return baseIsFrameworkPath;
  const wrapperFiles = diffOutsidePackageFiles(defineStack, callStack, baseIsFrameworkPath);
  if (wrapperFiles.length === 0) return baseIsFrameworkPath;
  const wrapperSet = new Set(wrapperFiles);
  return (path) => baseIsFrameworkPath(path) || wrapperSet.has(path.replace(/\\/g, '/'));
};

const buildIsFrameworkPath = (
  trace: StackTrace,
  options?: ResolvePositionOptions,
): ((path: string) => boolean) =>
  buildIsExcludedPath(trace, options?.isFrameworkPath ?? defaultIsFrameworkPath);

export const resolvePosition = (
  trace: StackTrace | undefined,
  options?: ResolvePositionOptions,
): Position | undefined => {
  if (!trace) return undefined;
  const stack = trace.error.stack;
  if (!stack) return undefined;
  return findFirstUserPosition(stack, buildIsFrameworkPath(trace, options));
};

// デコレータ機構そのもの (decorator-metadata) のフレーム判定。
// workspace 実行時は PACKAGE_ROOT、インストール実行時はパッケージパスの
// マーカーで判定する (テスト fixture は resolvePosition と同様に機構扱いしない)
const isDecoratorMachineryPath = (path: string): boolean => {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.startsWith('node:')) return true;
  if (normalized.includes('/@zeltjs/decorator-metadata/')) return true;
  if (!isWithinPackageRoot(normalized, PACKAGE_ROOT)) return false;
  return !isPackageTestPath(normalized, PACKAGE_ROOT);
};

/**
 * クラス定義サイト (デコレータが適用されたモジュール) の位置を返す。
 * resolvePosition が「ユーザーがデコレータを書いた場所」を探すために node_modules を
 * 一律除外するのに対し、こちらは ClassSource 用に node_modules 内の定義もそのまま返す。
 * 除外するのは機構自身と、define/call スタック差分から検出した factory wrapper のみ。
 */
export const resolveDefinitionPosition = (trace: StackTrace | undefined): Position | undefined => {
  if (!trace) return undefined;
  const stack = trace.error.stack;
  if (!stack) return undefined;
  return findFirstUserPosition(stack, buildIsExcludedPath(trace, isDecoratorMachineryPath));
};
