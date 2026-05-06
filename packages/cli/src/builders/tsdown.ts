import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import consola from 'consola';
import { errAsync, okAsync, ResultAsync } from 'neverthrow';

import type { BuildConfig } from '../config/schema';

export type BuildOptions = {
  readonly cwd: string;
  readonly config: BuildConfig;
};

export type BuildError = { type: 'BUILD_FAILED'; exitCode: number };

const buildArgs = (config: BuildConfig): string[] => {
  const args: string[] = [];

  if (config.entry !== undefined) {
    args.push('--entry', config.entry);
  }

  if (config.outDir !== undefined) {
    args.push('--out-dir', config.outDir);
  }

  if (config.format !== undefined) {
    args.push('--format', config.format);
  }

  if (config.platform !== undefined) {
    args.push('--platform', config.platform);
  }

  if (config.external === true) {
    args.push('--deps.never-bundle', '*');
  }

  args.push('--clean');
  args.push('--no-config');

  return args;
};

export const runTsdownBuild = (options: BuildOptions): ResultAsync<void, BuildError> => {
  const { cwd, config } = options;
  const args = buildArgs(config);

  consola.info(`Running tsdown in ${cwd}`);
  consola.debug(`tsdown ${args.join(' ')}`);

  const tsdownBin = resolve(cwd, 'node_modules/.bin/tsdown');

  return ResultAsync.fromPromise(
    new Promise<number>((resolvePromise, rejectPromise) => {
      const child = spawn(tsdownBin, args, {
        cwd,
        stdio: 'inherit',
      });

      child.on('close', (code) => {
        resolvePromise(code ?? 0);
      });

      child.on('error', (err) => {
        rejectPromise(err);
      });
    }),
    () => ({ type: 'BUILD_FAILED' as const, exitCode: 1 }),
  ).andThen((exitCode) => {
    if (exitCode !== 0) {
      return errAsync({ type: 'BUILD_FAILED' as const, exitCode });
    }
    return okAsync(undefined);
  });
};
