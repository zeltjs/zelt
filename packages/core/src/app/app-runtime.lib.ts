import { Container, injectable } from '@needle-di/core';

import { overrideConfig, resolveConfig } from '../built-in-service';
import { inject, LifecycleManager, resolve, ZeltLifecycleStateError } from '../kernel';
import { ConfigRegistry } from './config-registry.lib';

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

  /** @throws {ZeltLifecycleStateError | ZeltReadyFailedError} */
  async ready(): Promise<ReadyResult> {
    if (this.state === 'disposed') {
      throw new ZeltLifecycleStateError({ operation: 'ready', currentState: 'disposed' });
    }
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.state = 'starting';
    this.readyPromise = this.doReady();
    return this.readyPromise;
  }

  /** @throws {ZeltLifecycleStateError | ZeltReadyFailedError} */
  private async doReady(): Promise<ReadyResult> {
    await this.lifecycleManager.startup();

    if (this.state === 'disposed') {
      throw new ZeltLifecycleStateError({ operation: 'ready', currentState: 'disposed' });
    }

    this.state = 'ready';
    this.cachedResult = this.buildReadyResult();
    return this.cachedResult;
  }

  /** @throws {ZeltLifecycleStateError} */
  applyRegisteredConfigs(): void {
    this.assertCanModifyConfig('applyRegisteredConfigs');

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

  /** @throws {ZeltLifecycleStateError | ZeltReadyFailedError} */
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

  /** @throws {ZeltLifecycleStateError} */
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
