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
  // esbuild が TC39 Stage 3 decorators を lowering する際に出力する内部ヘルパー
  // (esbuild の internal/runtime/runtime.go に実装がある)
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

const readStack = (error: Error | undefined): string | undefined => {
  const stack: unknown = error?.stack;
  return typeof stack === 'string' && stack.length > 0 ? stack : undefined;
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
// 直後 1 frame のみを見ると、ts-pattern の内部実装がフレームを1つ増やした場合に
// 検出が壊れて誤ったファイルへ解決してしまう。そのため機構フレームに再入するまで
// 有界に先読みし、再入するまでの間のフレームはすべて機構の一部とみなす
// (末尾の node: モジュールローダフレームは機構外の呼び出し元なので対象外)
//
// N=5: ts-pattern 5.6.2 時点の match/with dispatch は機構フレーム間に高々1 frame
// しか挟まないが、内部実装のリファクタで数 frame 増えても追従できるよう余裕を持たせた
const MACHINERY_SANDWICH_LOOKAHEAD = 5;

const isSandwichedByMachinery = (lines: readonly string[], index: number): boolean => {
  for (let offset = 1; offset <= MACHINERY_SANDWICH_LOOKAHEAD; offset++) {
    const line = lines[index + offset];
    if (!line) return false;
    const file = extractFilePath(line);
    if (!file) continue;
    if (isDecoratorMetadataPackagePath(file.replace(/\\/g, '/'))) return true;
  }
  return false;
};

type StackFrame = {
  readonly position: Position;
  readonly functionName: string | undefined;
};

const parseFrames = (stack: string): readonly (StackFrame | undefined)[] =>
  stack
    .split('\n')
    .slice(2)
    .map((line) => {
      const position = parsePositionFromStackLine(line, () => false);
      if (!position) return undefined;
      return { position, functionName: line.match(/^\s*at\s+(.*?)\s+\(/)?.[1] };
    });

const sameActivation = (left: StackFrame, right: StackFrame): boolean =>
  left.position.sourceFile.replace(/\\/g, '/') === right.position.sourceFile.replace(/\\/g, '/') &&
  left.functionName === right.functionName;

const sameFrame = (left: StackFrame, right: StackFrame): boolean =>
  sameActivation(left, right) &&
  left.position.line === right.position.line &&
  left.position.column === right.position.column;

const outerContextLength = (
  define: readonly (StackFrame | undefined)[],
  call: readonly (StackFrame | undefined)[],
  defineIndex: number,
  callIndex: number,
): number => {
  let length = 0;
  for (const left of define.slice(defineIndex + 1)) {
    const right = call[callIndex + length + 1];
    if (!left || !right || !sameFrame(left, right)) return length;
    length++;
  }
  return length;
};

const applicationFrame = (
  stack: string,
): { readonly position: Position; readonly index: number } | undefined => {
  const lines = stack.split('\n').slice(2);
  for (const [index, line] of lines.entries()) {
    if (isTranspilerHelperFrame(line)) continue;
    const position = resolvePositionAt(
      lines,
      index,
      isDecoratorMachineryPath,
      isSandwichedByMachinery,
    );
    if (position) return { position, index };
  }
  return undefined;
};

const findExpressionPosition = (
  define: readonly (StackFrame | undefined)[],
  call: readonly (StackFrame | undefined)[],
  callIndex: number,
  isFrameworkPath: (path: string) => boolean,
): Position | undefined => {
  const appliedFrame = call[callIndex];
  if (!appliedFrame) return undefined;
  const candidates = define.flatMap((frame, index) =>
    frame && !isFrameworkPath(frame.position.sourceFile) && sameActivation(frame, appliedFrame)
      ? [{ frame, context: outerContextLength(define, call, index, callIndex) }]
      : [],
  );
  const bestContext = Math.max(...candidates.map((candidate) => candidate.context));
  const best = candidates.filter((candidate) => candidate.context === bestContext);
  const selected = best.length === 1 ? best[0] : undefined;
  if (!selected || (selected.context === 0 && !sameFrame(selected.frame, appliedFrame)))
    return undefined;
  return selected.frame.position;
};

/** Resolve the factory expression in the activation where the decorator was applied.
 * Call-site coordinates may be synthesized by a transpiler. They identify the
 * activation only; the returned coordinates always come from the define trace.
 * Repeated/anonymous activations require a unique match of the ordered outer
 * frames (including their coordinates). An ambiguous match stays unresolved.
 */
export const resolvePosition = (
  trace: StackTrace | undefined,
  options?: ResolvePositionOptions,
): Position | undefined => {
  const stack = readStack(trace?.error);
  if (!stack) return undefined;
  const isFrameworkPath = options?.isFrameworkPath ?? defaultIsFrameworkPath;
  const callStack = readStack(trace?.callError);
  if (!callStack) return findFirstUserPosition(stack, isFrameworkPath);
  const application = applicationFrame(callStack);
  if (!application) return undefined;
  return findExpressionPosition(
    parseFrames(stack),
    parseFrames(callStack),
    application.index,
    isFrameworkPath,
  );
};

/** Module hint from decorator application, including dependencies in node_modules.
 * Its line/column may be generated code; use getClassDeclarationPosition for an
 * AST-verified class declaration and getClassSource for an importable reference.
 */
export const resolveDefinitionPosition = (trace: StackTrace | undefined): Position | undefined => {
  if (!trace) return undefined;
  const stack = readStack(trace.error);
  if (!stack) return undefined;
  const callStack = readStack(trace.callError);
  if (callStack) return applicationFrame(callStack)?.position;
  return findFirstUserPosition(stack, isDecoratorMachineryPath);
};
