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

const defaultIsFrameworkPath = (path: string): boolean => {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.includes('/node_modules/')) return true;
  if (normalized.startsWith('node:')) return true;
  if (!normalized.startsWith(`${PACKAGE_ROOT}/`)) return false;
  // Test files within this package are user code that exercises decorators —
  // they must remain visible to position resolution so decorator usage inside
  // tests reports the test file, not framework internals.
  const relative = normalized.slice(PACKAGE_ROOT.length + 1);
  if (relative.startsWith('src/test/') || relative.startsWith('dist/test/')) return false;
  return true;
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

export const resolvePosition = (
  trace: StackTrace | undefined,
  options?: ResolvePositionOptions,
): Position | undefined => {
  if (!trace) return undefined;
  const stack = trace.error.stack;
  if (!stack) return undefined;
  return findFirstUserPosition(stack, options?.isFrameworkPath ?? defaultIsFrameworkPath);
};
