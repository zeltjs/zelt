import { Container, injectable } from '@needle-di/core';

import { overrideConfig, resolveConfig } from '../built-in-service/config';
import { LifecycleManager } from '../kernel';
import { inject, resolve } from '../kernel/di';
import { ZeltLifecycleStateError } from '../kernel/errors';
import { ConfigRegistry } from './config-registry.lib';

export type ReadyOptions = {
  readonly warmup?: boolean;
};

export type ReadyResult = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
};

type AppRuntimeState = 'idle' | 'starting' | 'ready' | 'disposed';

@injectable()
export class AppRuntime {
  private state: AppRuntimeState = 'idle';
  private readyPromise: Promise<ReadyResult> | undefined;
  private cachedResult: ReadyResult | undefined;

  constructor(
    private readonly container: Container = inject(Container),
    private readonly lifecycleManager: LifecycleManager = inject(LifecycleManager),
    private readonly configRegistry: ConfigRegistry = inject(ConfigRegistry),
  ) {}

  /** @throws {ZeltLifecycleStateError} */
  async ready(options?: ReadyOptions): Promise<ReadyResult> {
    if (this.state === 'disposed') {
      throw new ZeltLifecycleStateError({ operation: 'ready', currentState: 'disposed' });
    }
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.state = 'starting';
    this.readyPromise = this.doReady(options);
    return this.readyPromise;
  }

  /** @throws {ZeltLifecycleStateError} */
  private async doReady(options?: ReadyOptions): Promise<ReadyResult> {
    this.bindConfigs();
    if (options?.warmup) {
      await this.lifecycleManager.warmup();
    }
    await this.lifecycleManager.startup();

    if (this.state === 'disposed') {
      throw new ZeltLifecycleStateError({ operation: 'ready', currentState: 'disposed' });
    }

    this.state = 'ready';
    this.cachedResult = this.buildReadyResult();
    return this.cachedResult;
  }

  private bindConfigs(): void {
    const allConfigs = this.configRegistry.getOverrides();
    const defaults = this.configRegistry.getDefaults();

    for (const config of allConfigs) {
      overrideConfig(this.container, config);
    }
    for (const config of defaults) {
      overrideConfig(this.container, config, { fallback: true });
    }
    for (const config of allConfigs) {
      resolveConfig(this.container, config);
    }
  }

  /** @throws {ZeltLifecycleStateError} */
  private buildReadyResult(): ReadyResult {
    return {
      get: async <T extends object>(cls: new (...args: never[]) => T): Promise<T> => {
        if (this.state === 'disposed') {
          throw new ZeltLifecycleStateError({ operation: 'get', currentState: 'disposed' });
        }
        const instance = resolve(this.container, cls);
        await this.lifecycleManager.startupPending();
        return instance;
      },
    };
  }

  async shutdown(): Promise<void> {
    if (this.state === 'disposed') {
      return;
    }
    this.state = 'disposed';

    if (this.readyPromise) {
      try {
        await this.readyPromise;
      } catch {
        // ready failed, ignore
      }
    }

    await this.lifecycleManager.shutdown();
  }

  /** @throws {ZeltLifecycleStateError} */
  assertCanModifyConfig(operation: string): void {
    if (this.state !== 'idle') {
      throw new ZeltLifecycleStateError({ operation, currentState: this.state });
    }
  }
}
