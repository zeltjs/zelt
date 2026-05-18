import { Container, injectable } from '@needle-di/core';

import { runInCommandContext } from '../../command/command-context';
import type { ExecResult } from '../../command/exec-result';
import { getCommandMetadata } from '../../command/metadata';
import { parseArgv } from '../../command/parse-argv';
import type { SchemaDefinition } from '../../command/schema';
import type { CommandClass } from '../../command/types';
import { inject } from '../../di/inject';
import { resolve } from '../../di/resolve';
import {
  ZeltAppConfigurationError,
  ZeltCommandExecutionError,
  ZeltDecoratorUsageError,
} from '../../errors';
import type { Lifecycle } from '../../lifecycle';
import { LifecycleManager } from '../../lifecycle';
import { COMMAND_OPTIONS } from '../tokens';

@injectable()
export class CommandModule implements Lifecycle {
  private readonly commandMap = new Map<string, CommandClass>();

  /** @throws {ZeltAppConfigurationError | ZeltDecoratorUsageError} */
  constructor(
    private readonly commands: readonly CommandClass[] = inject(COMMAND_OPTIONS),
    private readonly lifecycleManager: LifecycleManager = inject(LifecycleManager),
    private readonly container: Container = inject(Container),
  ) {
    this.lifecycleManager.register(this);
    this.validateAndRegisterCommands();
  }

  async startup(): Promise<void> {}

  async shutdown(): Promise<void> {
    this.commandMap.clear();
  }

  private validateAndRegisterCommands(): void {
    for (const cls of this.commands) {
      const meta = getCommandMetadata(cls);
      if (!meta) {
        throw new ZeltDecoratorUsageError({
          decoratorName: 'Command',
          reason: 'missing_decorator',
          targetName: cls.name,
        });
      }
      if (this.commandMap.has(meta.name)) {
        throw new ZeltAppConfigurationError({ reason: 'duplicate_command', details: meta.name });
      }
      this.commandMap.set(meta.name, cls);
    }
  }

  hasCommand(name: string): boolean {
    return this.commandMap.has(name);
  }

  getCommands(): ReadonlyMap<string, CommandClass> {
    return this.commandMap;
  }

  private async runCommand(
    CommandClass: CommandClass,
    commandName: string,
    argv: readonly string[],
  ): Promise<ExecResult> {
    // Runtime safety: schema may be undefined despite type definition
    const commandWithOptionalSchema: { schema?: SchemaDefinition } = CommandClass;
    const schema = commandWithOptionalSchema.schema ?? { args: [], options: [] };
    const parseResult = parseArgv(argv, schema);
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

    const instance = resolve(this.container, CommandClass);

    try {
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

  async exec(argv: readonly string[]): Promise<ExecResult> {
    const commandName = argv[0];

    if (!commandName) {
      return {
        exitCode: 1,
        reason: new ZeltCommandExecutionError({ reason: 'no_command_specified' }),
      };
    }

    const CommandClass = this.commandMap.get(commandName);
    if (!CommandClass) {
      return {
        exitCode: 1,
        reason: new ZeltCommandExecutionError({ reason: 'command_not_found', commandName }),
      };
    }

    return this.runCommand(CommandClass, commandName, argv.slice(1));
  }
}
