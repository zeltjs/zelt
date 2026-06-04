import type { ConfiguredFeature } from '../feature.types';
import { COMMAND_OPTIONS, CommandService } from './command.service';
import type { CommandClass } from './command.types';
import type { ExecResult } from './exec-result.types';

export type CommandCapabilities = {
  readonly hasCommand: (name: string) => boolean;
  readonly getCommands: () => ReadonlyMap<string, CommandClass>;
  readonly execCommand: (argv: readonly string[]) => Promise<ExecResult>;
};

export const command = (
  commands: readonly CommandClass[],
): ConfiguredFeature<'commands', CommandCapabilities> => ({
  key: 'commands',
  bind: (container) => {
    container.bind({ provide: COMMAND_OPTIONS, useValue: commands });
  },
  createCapabilities: async (runtime) => {
    const service = await runtime.get(CommandService);
    return {
      hasCommand: (name) => service.hasCommand(name),
      getCommands: () => service.getCommands(),
      execCommand: (argv) => service.exec(argv),
    };
  },
});
