import type { CommandClass } from '@zeltjs/core';
import { defineCommand } from 'citty';
import consola from 'consola';
import { match } from 'ts-pattern';

import { ConfigLoadError, loadZeltConfig } from '../config/loader';

import { type LoadCommandsError, GlobError, ImportError, loadCommands } from './run/loader';
import { CommandExecutionError, runCommand } from './run/runner';

class NoCommandsConfigError extends Error {
  readonly type = 'NO_COMMANDS_CONFIG' as const;
}

class CommandNotFoundError extends Error {
  readonly type = 'COMMAND_NOT_FOUND' as const;
  readonly commandName: string;
  readonly available: string[];
  constructor(name: string, available: string[]) {
    super(`Command not found: ${name}`);
    this.name = 'CommandNotFoundError';
    this.commandName = name;
    this.available = available;
  }
}

type RunError =
  | ConfigLoadError
  | LoadCommandsError
  | CommandExecutionError
  | NoCommandsConfigError
  | CommandNotFoundError;

const findCommand = (commands: Map<string, CommandClass>, name: string): CommandClass => {
  const commandClass = commands.get(name);
  if (!commandClass) {
    throw new CommandNotFoundError(name, [...commands.keys()]);
  }
  return commandClass;
};

const executeCommand = async (
  cwd: string,
  commandsPattern: string | undefined,
  commandName: string,
  commandArgs: string[],
): Promise<void> => {
  if (!commandsPattern) {
    throw new NoCommandsConfigError();
  }

  const commands = await loadCommands(cwd, commandsPattern);
  const commandClass = findCommand(commands, commandName);
  await runCommand(commandClass, commandArgs);
};

const handleError = (error: RunError): void => {
  match(error)
    .with({ type: 'CONFIG_LOAD_FAILED' }, () => {
      consola.error('Failed to load config');
    })
    .with({ type: 'NO_COMMANDS_CONFIG' }, () => {
      consola.error('No commands config found. Add "commands" to zelt.config.ts');
    })
    .with({ type: 'GLOB_FAILED' }, (e) => {
      consola.error('Failed to scan command files:', e.cause);
    })
    .with({ type: 'IMPORT_FAILED' }, (e) => {
      consola.error(`Failed to import command file: ${e.file}`, e.cause);
    })
    .with({ type: 'COMMAND_NOT_FOUND' }, (e) => {
      consola.error(`Command not found: ${e.commandName}`);
      consola.info('Available commands:');
      for (const name of e.available) {
        consola.info(`  - ${name}`);
      }
    })
    .with({ type: 'COMMAND_EXECUTION_FAILED' }, (e) => {
      consola.error('Command execution failed:', e.cause);
    })
    .exhaustive();
};

const isRunError = (error: unknown): error is RunError =>
  error instanceof ConfigLoadError ||
  error instanceof GlobError ||
  error instanceof ImportError ||
  error instanceof CommandExecutionError ||
  error instanceof NoCommandsConfigError ||
  error instanceof CommandNotFoundError;

const runMain = async (
  cwd: string,
  configFile: string | undefined,
  commandName: string,
  commandArgs: string[],
): Promise<void> => {
  const config = await loadZeltConfig(configFile !== undefined ? { cwd, configFile } : { cwd });
  await executeCommand(cwd, config.commands, commandName, commandArgs);
};

export const runCommandDef = defineCommand({
  meta: {
    name: 'run',
    description: 'Run a custom command',
  },
  args: {
    config: {
      type: 'string',
      alias: 'c',
      description: 'Path to zelt.config.ts',
    },
    command: {
      type: 'positional',
      description: 'Command name to run',
      required: true,
    },
  },
  async run({ args, rawArgs }) {
    const cwd = globalThis.process.cwd();
    const configFile = args.config as string | undefined;
    const commandName = args.command as string;
    const commandArgs = rawArgs.slice(rawArgs.indexOf(commandName) + 1);

    try {
      await runMain(cwd, configFile, commandName, commandArgs);
    } catch (error) {
      if (isRunError(error)) {
        handleError(error);
      } else {
        throw error;
      }
    }
  },
});
