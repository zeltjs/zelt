import type { Module } from '../module.types';
import { COMMAND_OPTIONS, CommandService } from './command.service';
import type { CommandClass } from './command.types';
import type { ExecResult } from './exec-result.types';

export type CommandCapabilities = {
  readonly hasCommand: (name: string) => boolean;
  readonly getCommands: () => ReadonlyMap<string, CommandClass>;
  readonly execCommand: (argv: readonly string[]) => Promise<ExecResult>;
};

export const CommandModule: Module<'commands', readonly CommandClass[], CommandCapabilities> = {
  key: 'commands',
  bind: (container, commands) => {
    container.bind({ provide: COMMAND_OPTIONS, useValue: commands });
  },
  resolve: (container) => {
    const service = container.get(CommandService);
    return {
      hasCommand: (name) => service.hasCommand(name),
      getCommands: () => service.getCommands(),
      execCommand: (argv) => service.exec(argv),
    };
  },
};
