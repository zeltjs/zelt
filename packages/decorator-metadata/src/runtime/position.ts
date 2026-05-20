export type Position = {
  readonly sourceFile: string;
  readonly line: number;
  readonly column: number;
};

export type GetCallerPositionOptions = {
  readonly isFrameworkPath?: (path: string) => boolean;
};

const defaultIsFrameworkPath = (path: string): boolean =>
  path.includes('/node_modules/') || path.includes('/packages/decorator-metadata/src/runtime/');

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
  // Start at frame 2 to skip Error itself and the immediate caller (this
  // function), so the first candidate is the user's stack frame.
  const lines = stack.split('\n').slice(2);
  for (const line of lines) {
    if (!line) continue;
    const pos = parsePositionFromStackLine(line, isFrameworkPath);
    if (pos) return pos;
  }
  return undefined;
};

export const getCallerPosition = (options?: GetCallerPositionOptions): Position | undefined => {
  // Some sandboxed runtimes (and certain instrumentation libraries) override
  // Error.prototype.stack to block stack inspection.
  if (Object.getOwnPropertyDescriptor(Error.prototype, 'stack') !== undefined) return undefined;
  const stack = new Error().stack;
  if (!stack) return undefined;
  return findFirstUserPosition(stack, options?.isFrameworkPath ?? defaultIsFrameworkPath);
};
