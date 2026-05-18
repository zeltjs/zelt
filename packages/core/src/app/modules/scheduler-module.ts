import { Container, injectable } from '@needle-di/core';

import { inject } from '../../di/inject';
import { resolve } from '../../di/resolve';
import { ZeltNotImplementedError } from '../../errors';
import type { Lifecycle } from '../../lifecycle';
import { LifecycleManager } from '../../lifecycle';
import type { SchedulerRunner } from '../../scheduler/runner';
import { createSchedulerRunner } from '../../scheduler/runner';
import { SCHEDULER_OPTIONS } from '../tokens';

export type SchedulerClass = new (...args: never[]) => object;

@injectable()
export class SchedulerModule implements Lifecycle {
  private runner: SchedulerRunner | undefined;

  constructor(
    private readonly schedulers: readonly SchedulerClass[] = inject(SCHEDULER_OPTIONS),
    private readonly container: Container = inject(Container),
    private readonly lifecycleManager: LifecycleManager = inject(LifecycleManager),
  ) {
    this.lifecycleManager.register(this);
  }

  /** @throws {ZeltNotImplementedError} */
  async startup(): Promise<void> {
    if (this.schedulers.length === 0) return;
    const resolver = {
      get: <T extends object>(cls: new (...args: never[]) => T): T => resolve(this.container, cls),
      getConfig: () => {
        throw new ZeltNotImplementedError({
          className: 'SchedulerModule',
          methodName: 'getConfig',
        });
      },
    };
    this.runner = createSchedulerRunner(this.schedulers, resolver);
  }

  async shutdown(): Promise<void> {
    await this.stopScheduler();
  }

  async startScheduler(): Promise<void> {
    if (this.runner && !this.runner.isRunning()) {
      await this.runner.startup();
    }
  }

  async stopScheduler(): Promise<void> {
    if (this.runner?.isRunning()) {
      await this.runner.shutdown();
    }
  }
}
