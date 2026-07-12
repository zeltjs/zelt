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
  '__decorateElement',
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

type ScanOptions = {
  // ヘルパーフレーム直後の匿名パスフレームも合成位置とみなしてスキップするか。
  // resolvePosition は「ユーザーが書いた意味のある行」を求めるため既定で有効にするが、
  // resolveDefinitionPosition はファイルさえ合っていればよく、Vite/Vitest の TC39
  // デコレータ変換ではこの位置が「行番号は合成だがファイルは正しい」ことがあるため無効にする
  readonly skipAnonymousAfterHelper?: boolean;
  readonly isStillMachinery?: (lines: readonly string[], index: number) => boolean;
};

// helper: 合成フレームそのもの。anonAfterHelper: helper 直後に続く、行番号のない
// 匿名パスフレーム（helper が生成した合成コードの続き）。candidate: 位置解決を試みる対象
type FrameClass = 'helper' | 'anonAfterHelper' | 'candidate';

const classifyFrame = (
  line: string,
  prevWasHelperFrame: boolean,
  skipAnonymousAfterHelper: boolean,
): FrameClass => {
  if (isTranspilerHelperFrame(line)) return 'helper';
  if (skipAnonymousAfterHelper && prevWasHelperFrame && isAnonymousPathFrame(line)) {
    return 'anonAfterHelper';
  }
  return 'candidate';
};

const resolvePositionAt = (
  lines: readonly string[],
  index: number,
  isFrameworkPath: (path: string) => boolean,
  isStillMachinery?: (lines: readonly string[], index: number) => boolean,
): Position | undefined => {
  const pos = parsePositionFromStackLine(lines[index] ?? '', isFrameworkPath);
  if (!pos) return undefined;
  if (isStillMachinery?.(lines, index)) return undefined;
  return pos;
};

const scanForUserPosition = (
  lines: readonly string[],
  isFrameworkPath: (path: string) => boolean,
  options?: ScanOptions,
): Position | undefined => {
  const skipAnonymousAfterHelper = options?.skipAnonymousAfterHelper ?? true;
  let prevWasHelperFrame = false;
  for (const [index, line] of lines.entries()) {
    if (!line) continue;
    if (classifyFrame(line, prevWasHelperFrame, skipAnonymousAfterHelper) !== 'candidate') {
      prevWasHelperFrame = true;
      continue;
    }
    prevWasHelperFrame = false;
    const pos = resolvePositionAt(lines, index, isFrameworkPath, options?.isStillMachinery);
    if (pos) return pos;
  }
  return undefined;
};

const findFirstUserPosition = (
  stack: string,
  isFrameworkPath: (path: string) => boolean,
): Position | undefined => scanForUserPosition(stack.split('\n').slice(2), isFrameworkPath);

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

// decorator-metadata 自身のパッケージ内フレームかどうか (workspace 実行時は PACKAGE_ROOT、
// インストール実行時はパッケージパスのマーカーで判定する)。call スタック上で機構フレームに
// 挟まれたフレームを検出する際にも使うため、node: 判定とは分離しておく
const isDecoratorMetadataPackagePath = (path: string): boolean => {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.includes('/@zeltjs/decorator-metadata/')) return true;
  if (!isWithinPackageRoot(normalized, PACKAGE_ROOT)) return false;
  return !isPackageTestPath(normalized, PACKAGE_ROOT);
};

// デコレータ機構そのもの (decorator-metadata) のフレーム判定
// (テスト fixture は resolvePosition と同様に機構扱いしない)
const isDecoratorMachineryPath = (path: string): boolean => {
  if (path.replace(/\\/g, '/').startsWith('node:')) return true;
  return isDecoratorMetadataPackagePath(path);
};

// call トレースは decorator-metadata 内部のディスパッチ (ts-pattern の match/with) を
// 経由するため、機構フレームの間に機構外のフレーム (ts-pattern 自身の実装) が挟まる。
// 直後のフレームが decorator-metadata 自身に戻る場合は、まだ機構内とみなしてスキップする
// (末尾の node: モジュールローダフレームは機構外の呼び出し元なので対象外)
const isSandwichedByMachinery = (lines: readonly string[], index: number): boolean => {
  const nextLine = lines[index + 1];
  if (!nextLine) return false;
  const nextFile = extractFilePath(nextLine);
  return nextFile !== undefined && isDecoratorMetadataPackagePath(nextFile.replace(/\\/g, '/'));
};

/**
 * クラス定義サイト (デコレータが適用されたモジュール) の位置を返す。
 * resolvePosition が「ユーザーがデコレータを書いた場所」を探すために node_modules を
 * 一律除外するのに対し、こちらは ClassSource 用に node_modules 内の定義もそのまま返す。
 * 除外するのは機構自身と、define/call スタック差分から検出した factory wrapper のみ。
 *
 * define トレース (`trace.error`) は factory 型デコレータ (`@Controller('/x')`) では
 * クラス定義サイトを含むが、直付け型デコレータ (`createInjectableClassDecorator(...)` を
 * 直接 export するもの) ではモジュール読み込み時にしか捕捉されず定義サイトを含まない。
 * call トレース (`trace.callError`) はデコレータ適用時 = クラス定義サイトで常に捕捉される
 * ため、両スタイルで正しく解決できる call トレースを優先し、無い場合のみ define にフォールバックする。
 */
export const resolveDefinitionPosition = (trace: StackTrace | undefined): Position | undefined => {
  if (!trace) return undefined;
  const isExcludedPath = buildIsExcludedPath(trace, isDecoratorMachineryPath);
  const callStack = trace.callError?.stack;
  if (callStack) {
    const lines = callStack.split('\n').slice(2);
    const pos = scanForUserPosition(lines, isExcludedPath, {
      skipAnonymousAfterHelper: false,
      isStillMachinery: isSandwichedByMachinery,
    });
    if (pos) return pos;
  }
  const stack = trace.error.stack;
  if (!stack) return undefined;
  return findFirstUserPosition(stack, isExcludedPath);
};
