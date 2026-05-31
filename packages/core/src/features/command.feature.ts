import type { CommandCapabilities } from '../modules/command/command.module';
import { COMMAND_OPTIONS, CommandService } from '../modules/command/command.service';
import type { CommandClass } from '../modules/command/command.types';
import type { ConfiguredFeature } from './feature.types';

export type { CommandCapabilities };

export const command = (
  commands: readonly CommandClass[],
): ConfiguredFeature<'commands', CommandCapabilities> => ({
  key: 'commands',
  bind: (container) => {
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
});
