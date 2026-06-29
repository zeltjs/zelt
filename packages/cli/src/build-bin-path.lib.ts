import { delimiter, dirname, join } from 'node:path';

const findPathKey = (env: NodeJS.ProcessEnv): string =>
  Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';

const collectAncestorBinDirs = (cwd: string): string[] => {
  const dirs: string[] = [];
  let current = cwd;
  let parent = dirname(current);

  while (parent !== current) {
    dirs.push(join(current, 'node_modules', '.bin'));
    current = parent;
    parent = dirname(current);
  }

  dirs.push(join(current, 'node_modules', '.bin'));
  return dirs;
};

export const buildBinPath = (cwd: string, env: NodeJS.ProcessEnv): string => {
  const pathKey = findPathKey(env);
  const existingPath = env[pathKey];
  const entries = collectAncestorBinDirs(cwd);

  if (existingPath !== undefined && existingPath.length > 0) {
    entries.push(existingPath);
  }

  return entries.join(delimiter);
};

export const buildCommandEnv = (cwd: string, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const pathKey = findPathKey(env);
  return {
    ...env,
    [pathKey]: buildBinPath(cwd, env),
  };
};
