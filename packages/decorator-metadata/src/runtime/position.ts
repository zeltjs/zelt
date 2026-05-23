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

const defaultIsFrameworkPath = (path: string): boolean => {
  const normalized = path.replace(/\\/g, '/');
  return (
    normalized.includes('/node_modules/') ||
    normalized.includes('/packages/decorator-metadata/src/runtime/')
  );
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

const findFirstUserPosition = (
  stack: string,
  isFrameworkPath: (path: string) => boolean,
): Position | undefined => {
  const lines = stack.split('\n').slice(2);
  for (const line of lines) {
    if (!line) continue;
    // Skip transpiler-generated decorator helper frames even when they appear
    // inside user files — their line numbers map to synthesized positions in
    // the transpiled output, not to meaningful TypeScript source locations.
    if (isTranspilerHelperFrame(line)) continue;
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
