const isFrameworkPath = (path: string): boolean =>
  path.includes('node_modules') || (path.includes('packages/core/') && !path.includes('.test.'));

const parseFileFromStackLine = (line: string): string | undefined => {
  const parenMatch = line.match(/\(([^)]+\.[tj]sx?):\d+:\d+\)/);
  const parenFile = parenMatch?.[1];
  if (parenFile && !isFrameworkPath(parenFile)) {
    return parenFile;
  }

  const atMatch = line.match(/at\s+([^\s]+\.[tj]sx?):\d+/);
  const atFile = atMatch?.[1];
  if (atFile && !isFrameworkPath(atFile)) {
    return atFile;
  }

  return undefined;
};

export const getCallerFile = (): string | undefined => {
  const stack = new Error().stack;
  // In some environments, Error.prototype.stack is overridden to block stack access
  if (!stack || Object.getOwnPropertyDescriptor(Error.prototype, 'stack') !== undefined)
    return undefined;

  const lines = stack.split('\n');
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const file = parseFileFromStackLine(line);
    if (file) return file;
  }

  return undefined;
};
