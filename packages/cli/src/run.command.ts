import { spawn } from 'node:child_process';

import { defineCommand } from 'citty';
import consola from 'consola';
import { match } from 'ts-pattern';

import type { ZeltConfigLoadError } from './cli.errors';
import {
  isZeltCliExecutionError,
  isZeltConfigLoadError,
  isZeltNoCliEntryError,
  ZeltCliExecutionError,
  ZeltNoCliEntryError,
} from './cli.errors';
import type { CliConfig } from './config/config.types';
import { loadZeltConfig } from './config/index';

type RunError =
  | InstanceType<typeof ZeltConfigLoadError>
  | InstanceType<typeof ZeltNoCliEntryError>
  | InstanceType<typeof ZeltCliExecutionError>;

const resolveCliConfig = (cliConfigFromFile: CliConfig | undefined) => ({
  entry: cliConfigFromFile?.entry,
});

const executeCliEntry = (cwd: string, entry: string, args: readonly string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const entryPath = entry.startsWith('.') ? `${cwd}/${entry}` : entry;
    const child = spawn('tsx', [entryPath, ...args], {
      cwd,
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new ZeltCliExecutionError({ exitCode: code }));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });

/** @throws {ZeltConfigLoadError | ZeltNoCliEntryError | InvalidConfigExportError} */
const runCli = async (
  cwd: string,
  configFile: string | undefined,
  args: string[],
): Promise<void> => {
  const config = await loadZeltConfig(configFile !== undefined ? { cwd, configFile } : { cwd });
  const cliConf = resolveCliConfig(config.cli);

  if (cliConf.entry === undefined) {
    throw new ZeltNoCliEntryError({});
  }

  await executeCliEntry(cwd, cliConf.entry, args);
};

const handleError = (error: RunError, setExitCode: (code: number) => void): void => {
  match(error)
    .when(isZeltConfigLoadError, () => {
      consola.error('Failed to load config');
    })
    .when(isZeltNoCliEntryError, () => {
      consola.error('No CLI entry specified. Set cli.entry in zelt.config.ts');
    })
    .when(isZeltCliExecutionError, (e) => {
      setExitCode(e.context.exitCode);
    })
    .otherwise(() => {});
};

const isRunError = (error: unknown): error is RunError =>
  isZeltConfigLoadError(error) || isZeltNoCliEntryError(error) || isZeltCliExecutionError(error);

export const runCommandDef = defineCommand({
  meta: {
    name: 'run',
    description: 'Run CLI commands defined in cli.entry',
  },
  args: {
    config: {
      type: 'string',
      alias: 'c',
      description: 'Path to zelt.config.ts',
    },
  },
  async run({ args, rawArgs }) {
    const cwd = process.cwd();
    // citty types config as `string` but it's actually `string | undefined` at runtime when omitted
    const configFile = args.config || undefined;
    const cliArgs = rawArgs.filter(
      (arg) => arg !== '-c' && arg !== '--config' && arg !== configFile,
    );

    try {
      await runCli(cwd, configFile, cliArgs);
    } catch (error) {
      if (isRunError(error)) {
        handleError(error, (code) => {
          process.exitCode = code;
        });
      } else {
        throw error;
      }
    }
  },
});
