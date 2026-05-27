import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Position = {
  readonly sourceFile: string;
  readonly line: number;
  readonly column: number;
};

export type StackTrace = {
  _brand: 'StackTrace';
  readonly error: Error;
  // Files belonging to wrapper functions (e.g. @zeltjs/core's Controller)
  // identified by diffing the define-time stack against the call-time stack.
  // resolvePosition treats these as framework paths so wrapper frames are
  // skipped in favor of user code.
  readonly wrapperFiles?: readonly string[];
};

export type ResolvePositionOptions = {
  readonly isFrameworkPath?: (path: string) => boolean;
};

// Derive this package's root by walking up to the nearest package.json so
// framework-path detection works regardless of bundled layout (src/runtime/
// vs dist/) or install location (workspace symlinks vs node_modules realpath).
// Without this, decorators defined inside this package leak their own file
// paths as "user positions" because the stack frame falls inside dist/.
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
  // Test files within this package are user code that exercises decorators —
  // they must remain visible to position resolution so decorator usage inside
  // tests reports the test file, not framework internals.
  return !isPackageTestPath(normalized, PACKAGE_ROOT);
};

// SWC, TypeScript, and Babel inject decorator helpers into transpiled output.
// These helpers appear in user files but at synthesized positions that don't
// correspond to any real TypeScript source line.
const TRANSPILER_HELPER_NAMES = new Set([
  'applyClassDecs', // SWC TC39 decorator helper
  '__decorate', // TypeScript legacy experimentalDecorators
  '_decorate', // Babel decorator helper
  'applyDecs', // SWC older decorator helper
  'applyDecs2305', // SWC versioned decorator helper
  // SWC TC39 2022-03 member decorator helpers
  'memberDec',
  'applyMemberDec',
  'applyMemberDecs',
  'applyDecs2203R',
  '_apply_decs_2203_r',
]);

const isTranspilerHelperFrame = (line: string): boolean => {
  // Property accessor frames from transpiler-generated objects show "[as name]"
  // in V8 stack traces — these are synthesized by SWC/Babel and have no
  // corresponding source position.
  if (line.includes('[as ')) return true;

  const match = line.match(/^\s+at\s+([^\s(]+)/);
  if (!match?.[1]) return false;
  // Strip leading qualifiers like "Array.", "Object.", etc.
  const name = match[1].split('.').pop() ?? '';
  return TRANSPILER_HELPER_NAMES.has(name);
};

const tryParseMatch = (
  match: RegExpMatchArray | null,
  isFrameworkPath: (path: string) => boolean,
): Position | undefined => {
  if (!match) return undefined;
  const [, file, lineNum, colNum] = match;
  if (!file || !lineNum || !colNum) return undefined;
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

// Returns true if the frame has no named function — just a bare file path.
// Pattern: "    at /path/to/file.ts:line:col" (no function name before the path).
const isAnonymousPathFrame = (line: string): boolean =>
  /^\s+at\s+\//.test(line) || /^\s+at\s+[a-zA-Z]:\\/.test(line);

const extractFilePath = (line: string): string | undefined => {
  const parenMatch = line.match(/\(([^)]+):\d+:\d+\)/);
  if (parenMatch?.[1]) return parenMatch[1];
  const atMatch = line.match(/at\s+([^\s]+):\d+:\d+/);
  return atMatch?.[1];
};

const extractOutsidePackageFiles = (stack: string): Set<string> => {
  const lines = stack.split('\n').slice(1);
  const files = new Set<string>();
  for (const line of lines) {
    const file = extractFilePath(line);
    if (!file) continue;
    const normalized = file.replace(/\\/g, '/');
    if (defaultIsFrameworkPath(normalized)) continue;
    files.add(normalized);
  }
  return files;
};

const diffOutsidePackageFiles = (defineStack: string, callStack: string): readonly string[] => {
  const callFiles = extractOutsidePackageFiles(callStack);
  const defineFiles = extractOutsidePackageFiles(defineStack);
  const wrapperFiles: string[] = [];
  for (const file of defineFiles) {
    if (!callFiles.has(file)) wrapperFiles.push(file);
  }
  return wrapperFiles;
};

// Diff define-time vs call-time stack: files present at definition (when
// the wrapper called createClassDecorator) but absent at decoration (when
// the returned decorator was applied to the class) are wrappers. User code
// appears in both stacks, so it remains visible to resolvePosition.
export const withWrapperFiles = (
  defineTrace: StackTrace | undefined,
  callTrace: StackTrace | undefined,
): StackTrace | undefined => {
  if (!defineTrace) return undefined;
  const defineStack = defineTrace.error.stack;
  const callStack = callTrace?.error.stack;
  if (!defineStack || !callStack) return defineTrace;
  const wrapperFiles = diffOutsidePackageFiles(defineStack, callStack);
  if (wrapperFiles.length === 0) return defineTrace;
  return { ...defineTrace, wrapperFiles };
};

const findFirstUserPosition = (
  stack: string,
  isFrameworkPath: (path: string) => boolean,
): Position | undefined => {
  const lines = stack.split('\n').slice(2);
  let prevWasHelperFrame = false;
  for (const line of lines) {
    if (!line) continue;
    // Skip transpiler-generated decorator helper frames even when they appear
    // inside user files — their line numbers map to synthesized positions in
    // the transpiled output, not to meaningful TypeScript source locations.
    if (isTranspilerHelperFrame(line)) {
      prevWasHelperFrame = true;
      continue;
    }
    // Anonymous continuation frames that immediately follow a transpiler helper
    // frame are synthesized by the transpiler and do not correspond to real
    // TypeScript source positions.
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

export const captureStackTrace = (): StackTrace | undefined => {
  if (Object.getOwnPropertyDescriptor(Error.prototype, 'stack') !== undefined) return undefined;
  return { _brand: 'StackTrace', error: new Error() };
};

const buildIsFrameworkPath = (
  trace: StackTrace,
  options?: ResolvePositionOptions,
): ((path: string) => boolean) => {
  const baseIsFrameworkPath = options?.isFrameworkPath ?? defaultIsFrameworkPath;
  const wrapperFiles = trace.wrapperFiles;
  if (!wrapperFiles || wrapperFiles.length === 0) return baseIsFrameworkPath;
  const wrapperSet = new Set(wrapperFiles);
  return (path) => baseIsFrameworkPath(path) || wrapperSet.has(path.replace(/\\/g, '/'));
};

export const resolvePosition = (
  trace: StackTrace | undefined,
  options?: ResolvePositionOptions,
): Position | undefined => {
  if (!trace) return undefined;
  const stack = trace.error.stack;
  if (!stack) return undefined;
  return findFirstUserPosition(stack, buildIsFrameworkPath(trace, options));
};
