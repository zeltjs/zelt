import { injectable } from '@needle-di/core';

import { getCommandMetadata } from '../../command/metadata';
import type { CommandClass } from '../../command/types';
import { inject } from '../../di/inject';
import { ZeltAppConfigurationError, ZeltDecoratorUsageError } from '../../errors';
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
  ) {
    this.lifecycleManager.register(this);
    this.validateAndRegisterCommands();
  }

  async startup(): Promise<void> {}

  async shutdown(): Promise<void> {
    this.commandMap.clear();
  }

  /** @throws {ZeltDecoratorUsageError | ZeltAppConfigurationError} */
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
}
