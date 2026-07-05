import { spawn } from 'node:child_process';

import consola from 'consola';

import { buildCommandEnv } from './build-bin-path.lib';
import { ZeltBuildError } from './cli.errors';

export type CommandBuildOptions = {
  readonly cwd: string;
  readonly command: string;
  readonly env: NodeJS.ProcessEnv;
};

/** @throws {ZeltBuildError} */
export const runCommandBuild = async (options: CommandBuildOptions): Promise<void> => {
  const { cwd, command, env } = options;

  consola.info(`Running build command in ${cwd}`);
  consola.debug(command);

  const exitCode = await new Promise<number>((resolvePromise, rejectPromise) => {
    const child = spawn(command, {
      cwd,
      env: buildCommandEnv(cwd, env),
      shell: true,
      stdio: 'inherit',
    });

    child.on('close', (code, signal) => {
      if (code === 0 && signal === null) {
        resolvePromise(0);
        return;
      }

      resolvePromise(code ?? 1);
    });

    child.on('error', (err) => {
      rejectPromise(err);
    });
  });

  if (exitCode !== 0) {
    throw new ZeltBuildError({ exitCode });
  }
};
