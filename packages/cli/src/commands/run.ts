import type { CommandClass } from '@zeltjs/command';
import { defineCommand } from 'citty';
import consola from 'consola';
import { err, ok, type Result, type ResultAsync } from 'neverthrow';
import { match } from 'ts-pattern';

import { type ConfigLoadError, loadZeltConfig } from '../config/loader';

import { type LoadCommandsError, loadCommands } from './run/loader';
import { type RunCommandError, runCommand } from './run/runner';

type RunError =
  | ConfigLoadError
  | LoadCommandsError
  | RunCommandError
  | { type: 'NO_COMMANDS_CONFIG' }
  | { type: 'COMMAND_NOT_FOUND'; name: string; available: string[] };

const findCommand = (
  commands: Map<string, CommandClass>,
  name: string,
): Result<CommandClass, RunError> => {
  const commandClass = commands.get(name);
  if (!commandClass) {
    return err({
      type: 'COMMAND_NOT_FOUND',
      name,
      available: [...commands.keys()],
    });
  }
  return ok(commandClass);
};

const executeCommand = (
  cwd: string,
  commandsPattern: string | undefined,
  commandName: string,
  commandArgs: string[],
): ResultAsync<void, RunError> => {
  if (!commandsPattern) {
    return err({ type: 'NO_COMMANDS_CONFIG' } as const) as unknown as ResultAsync<void, RunError>;
  }

  return loadCommands(cwd, commandsPattern)
    .andThen((commands) => findCommand(commands, commandName))
    .andThen((commandClass) => runCommand(commandClass, commandArgs));
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
      consola.error(`Command not found: ${e.name}`);
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

    const result = await loadZeltConfig(
      configFile !== undefined ? { cwd, configFile } : { cwd },
    ).andThen((config) => executeCommand(cwd, config.commands, commandName, commandArgs));

    if (result.isErr()) {
      handleError(result.error);
    }
  },
});
