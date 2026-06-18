import { Container } from '@needle-di/core';
import {
  Injectable,
  inject,
  resolve,
  ZeltAppConfigurationError,
  ZeltCommandExecutionError,
  ZeltDecoratorUsageError,
} from '../../kernel';
import type { CommandClass } from './command.types';
import { getCommandMetadata } from './definition';
import type { ExecResult } from './exec-result.types';
import { bindCommandInput, runInCommandContext } from './input';
import type { SchemaDefinition } from './input/command-schema.types';

export type CommandRegistry = ReadonlyMap<string, CommandClass>;

@Injectable()
export class CommandService {
  constructor(private readonly container: Container = inject(Container)) {}

  /** @throws {ZeltDecoratorUsageError | ZeltAppConfigurationError} */
  buildRegistry(commands: readonly CommandClass[]): CommandRegistry {
    const registry = new Map<string, CommandClass>();
    for (const cls of commands) {
      const meta = getCommandMetadata(cls);
      if (!meta) {
        throw new ZeltDecoratorUsageError({
          decoratorName: 'Command',
          reason: 'missing_decorator',
          targetName: cls.name,
        });
      }
      if (registry.has(meta.name)) {
        throw new ZeltAppConfigurationError({ reason: 'duplicate_command', details: meta.name });
      }
      registry.set(meta.name, cls);
    }
    return registry;
  }

  async exec(registry: CommandRegistry, argv: readonly string[]): Promise<ExecResult> {
    const commandName = argv[0];

    if (!commandName) {
      return {
        exitCode: 1,
        reason: new ZeltCommandExecutionError({ reason: 'no_command_specified' }),
      };
    }

    const CommandClass = registry.get(commandName);
    if (!CommandClass) {
      return {
        exitCode: 1,
        reason: new ZeltCommandExecutionError({ reason: 'command_not_found', commandName }),
      };
    }

    return this.runCommand(CommandClass, commandName, argv.slice(1));
  }

  private async runCommand(
    CommandClass: CommandClass,
    commandName: string,
    argv: readonly string[],
  ): Promise<ExecResult> {
    const commandWithOptionalSchema: { schema?: SchemaDefinition } = CommandClass;
    const schema = commandWithOptionalSchema.schema ?? { args: [], options: [] };
    const parseResult = bindCommandInput(argv, schema);
    if (!parseResult.ok) {
      return {
        exitCode: 1 as const,
        reason: new ZeltCommandExecutionError({
          reason: 'argv_parse_error',
          commandName,
          details: parseResult.error,
        }),
      };
    }

    try {
      const instance = resolve(this.container, CommandClass);
      const result = runInCommandContext({ parsedArgs: parseResult.parsed }, () => instance.run());
      await Promise.resolve(result);
      return { exitCode: 0 as const };
    } catch (e: unknown) {
      const details = e instanceof Error ? e.message : String(e);
      const cause = e instanceof Error ? e : undefined;
      return {
        exitCode: 1 as const,
        reason: new ZeltCommandExecutionError({ reason: 'run_error', commandName, details }, cause),
      };
    }
  }
}
