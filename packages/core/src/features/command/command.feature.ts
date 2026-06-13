import type { ServiceResolver } from '../../app';
import { Feature } from '../../app';
import { CommandService } from './command.service';
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

  readonly featureClasses = (): readonly CommandClass[] => {
    return this.commands;
  };

  readonly blueprint = (): Record<never, never> => {
    return {};
  };

  readonly realize = async (resolver: ServiceResolver): Promise<CommandCapabilities> => {
    const service = await resolver.get(CommandService);
    const registry = service.buildRegistry(this.commands);
    return {
      hasCommand: (name) => registry.has(name),
      getCommands: () => registry,
      execCommand: (argv) => service.exec(registry, argv),
    };
  };
}

export const command = (commands: readonly CommandClass[]): CommandFeature =>
  new CommandFeature(commands);
