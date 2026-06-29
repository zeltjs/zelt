import { spawn } from 'node:child_process';

import consola from 'consola';

import { ZeltBuildError } from './cli.errors';

export type CommandBuildOptions = {
  readonly cwd: string;
  readonly command: string;
};

/** @throws {ZeltBuildError} */
export const runCommandBuild = async (options: CommandBuildOptions): Promise<void> => {
  const { cwd, command } = options;

  consola.info(`Running build command in ${cwd}`);
  consola.debug(command);

  const exitCode = await new Promise<number>((resolvePromise, rejectPromise) => {
    const child = spawn(command, {
      cwd,
      shell: true,
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
    throw new ZeltBuildError({ exitCode });
  }
};
