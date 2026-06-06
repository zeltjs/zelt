import type { Container } from '@needle-di/core';
import type { FeatureRuntime } from '../../app';
import { Feature } from '../../app';
import { COMMAND_OPTIONS, CommandService } from './command.service';
import type { CommandClass } from './command.types';
import type { ExecResult } from './exec-result.types';

export type CommandCapabilities = {
  readonly hasCommand: (name: string) => boolean;
  readonly getCommands: () => ReadonlyMap<string, CommandClass>;
  readonly execCommand: (argv: readonly string[]) => Promise<ExecResult>;
};

export class CommandFeature extends Feature<'commands', CommandCapabilities> {
  readonly key = 'commands' as const;

  constructor(private readonly commands: readonly CommandClass[]) {
    super();
  }

  readonly bind = (container: Container): void => {
    container.bind({ provide: COMMAND_OPTIONS, useValue: this.commands });
  };

  readonly staticCapabilities = (): Record<never, never> => {
    return {};
  };

  readonly createCapabilities = async (runtime: FeatureRuntime): Promise<CommandCapabilities> => {
    const service = await runtime.get(CommandService);
    return {
      hasCommand: (name) => service.hasCommand(name),
      getCommands: () => service.getCommands(),
      execCommand: (argv) => service.exec(argv),
    };
  };
}

export const command = (commands: readonly CommandClass[]): CommandFeature =>
  new CommandFeature(commands);
