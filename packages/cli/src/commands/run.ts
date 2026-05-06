import { defineCommand } from 'citty';
import consola from 'consola';
import { match } from 'ts-pattern';

import { loadZeltConfig } from '../config/loader';

import { loadCommands } from './run/loader';
import { runCommand } from './run/runner';

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

    const configResult = await loadZeltConfig(
      configFile !== undefined ? { cwd, configFile } : { cwd },
    );

    if (configResult.isErr()) {
      const error = configResult.error;
      match(error)
        .with({ type: 'CONFIG_LOAD_FAILED' }, () => {
          consola.error('Failed to load config');
        })
        .exhaustive();
      return;
    }

    const config = configResult.value;

    if (!config.commands) {
      consola.error('No commands config found. Add "commands" to zelt.config.ts');
      return;
    }

    const commandName = args.command as string;
    const commands = await loadCommands(cwd, config.commands);

    const commandClass = commands.get(commandName);
    if (!commandClass) {
      consola.error(`Command not found: ${commandName}`);
      consola.info('Available commands:');
      for (const name of commands.keys()) {
        consola.info(`  - ${name}`);
      }
      return;
    }

    const commandArgs = rawArgs.slice(rawArgs.indexOf(commandName) + 1);

    try {
      await runCommand(commandClass, commandArgs);
    } catch (error) {
      consola.error('Command execution failed:', error);
    }
  },
});
