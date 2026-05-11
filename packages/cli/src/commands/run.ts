import { spawn } from 'node:child_process';

import { NodeCliConfig } from '@zeltjs/adapter-node';
import { defineCommand } from 'citty';
import consola from 'consola';
import { match } from 'ts-pattern';

import { ConfigLoadError, loadZeltConfig } from '../config/loader';
import type { CliConfig } from '../config/schema';

const cliConfig = new NodeCliConfig();

class NoCliEntryError extends Error {
  readonly type = 'NO_CLI_ENTRY' as const;
}

class CliExecutionError extends Error {
  readonly type = 'CLI_EXECUTION_FAILED' as const;
  readonly exitCode: number;
  constructor(exitCode: number) {
    super(`CLI execution failed with exit code ${exitCode}`);
    this.name = 'CliExecutionError';
    this.exitCode = exitCode;
  }
}

type RunError = ConfigLoadError | NoCliEntryError | CliExecutionError;

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
        reject(new CliExecutionError(code));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });

const runCli = async (
  cwd: string,
  configFile: string | undefined,
  args: string[],
): Promise<void> => {
  const config = await loadZeltConfig(configFile !== undefined ? { cwd, configFile } : { cwd });
  const cliConf = resolveCliConfig(config.cli);

  if (cliConf.entry === undefined) {
    throw new NoCliEntryError();
  }

  await executeCliEntry(cwd, cliConf.entry, args);
};

const handleError = (error: RunError, setExitCode: (code: number) => void): void => {
  match(error)
    .with({ type: 'CONFIG_LOAD_FAILED' }, () => {
      consola.error('Failed to load config');
    })
    .with({ type: 'NO_CLI_ENTRY' }, () => {
      consola.error('No CLI entry specified. Set cli.entry in zelt.config.ts');
    })
    .with({ type: 'CLI_EXECUTION_FAILED' }, (e) => {
      setExitCode(e.exitCode);
    })
    .exhaustive();
};

const runErrorClasses = [ConfigLoadError, NoCliEntryError, CliExecutionError] as const;

const isRunError = (error: unknown): error is RunError =>
  runErrorClasses.some((ErrorClass) => error instanceof ErrorClass);

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
    const cwd = cliConfig.cwd();
    const configFile = args.config as string | undefined;
    const cliArgs = rawArgs.filter(
      (arg) => arg !== '-c' && arg !== '--config' && arg !== configFile,
    );

    try {
      await runCli(cwd, configFile, cliArgs);
    } catch (error) {
      if (isRunError(error)) {
        handleError(error, (code) => cliConfig.setExitCode(code));
      } else {
        throw error;
      }
    }
  },
});
