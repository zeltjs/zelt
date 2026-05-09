import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import consola from 'consola';

import type { BuildConfig } from '../config/schema';

export type BuildOptions = {
  readonly cwd: string;
  readonly config: BuildConfig;
};

export class BuildError extends Error {
  readonly type = 'BUILD_FAILED' as const;
  readonly exitCode: number;
  constructor(exitCode: number) {
    super(`Build failed with exit code ${exitCode}`);
    this.name = 'BuildError';
    this.exitCode = exitCode;
  }
}

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

export const runTsdownBuild = async (options: BuildOptions): Promise<void> => {
  const { cwd, config } = options;
  const args = buildArgs(config);

  consola.info(`Running tsdown in ${cwd}`);
  consola.debug(`tsdown ${args.join(' ')}`);

  const tsdownBin = resolve(cwd, 'node_modules/.bin/tsdown');

  const exitCode = await new Promise<number>((resolvePromise, rejectPromise) => {
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
  });

  if (exitCode !== 0) {
    throw new BuildError(exitCode);
  }
};
