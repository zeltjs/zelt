import { getCommandMetadata } from '../../command/metadata';
import type { CommandClass } from '../../command/types';
import type { Module, ReadyContext } from '../module';

export type CommandModule = Module & {
  hasCommand: (name: string) => boolean;
  getCommands: () => ReadonlyMap<string, CommandClass>;
};

type CommandModuleState = {
  readonly commandMap: Map<string, CommandClass>;
  isDisposed: boolean;
};

const validateCommands = (commands: readonly CommandClass[]): Map<string, CommandClass> => {
  const commandMap = new Map<string, CommandClass>();
  for (const cls of commands) {
    const meta = getCommandMetadata(cls);
    if (!meta) {
      throw new Error(`Command class ${cls.name} is missing @Command decorator`);
    }
    if (commandMap.has(meta.name)) {
      throw new Error(`Duplicate command name: ${meta.name}`);
    }
    commandMap.set(meta.name, cls);
  }
  return commandMap;
};

export const createCommandModule = (commands: readonly CommandClass[]): CommandModule => {
  const state: CommandModuleState = {
    commandMap: new Map(),
    isDisposed: false,
  };

  const setup = (): void => {
    const validated = validateCommands(commands);
    for (const [name, cls] of validated) {
      state.commandMap.set(name, cls);
    }
  };

  const ready = async (_context: ReadyContext): Promise<void> => {
    // command module has no async initialization
  };

  const shutdown = async (): Promise<void> => {
    state.isDisposed = true;
  };

  const hasCommand = (name: string): boolean => state.commandMap.has(name);

  const getCommands = (): ReadonlyMap<string, CommandClass> => state.commandMap;

  return {
    setup,
    ready,
    shutdown,
    hasCommand,
    getCommands,
  };
};
