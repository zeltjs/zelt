import { Container } from '@needle-di/core';
import { Injectable, inject, LifecycleManager, resolve } from '../../kernel';
import type { SchedulerClass } from './scheduler.types';
import type { SchedulerRunner } from './scheduler-runner.lib';
import { createSchedulerRunner } from './scheduler-runner.lib';

export type { SchedulerRunner } from './scheduler-runner.lib';

@Injectable()
export class SchedulerService {
  constructor(
    private readonly container: Container = inject(Container),
    private readonly lifecycleManager: LifecycleManager = inject(LifecycleManager),
  ) {}

  /** @throws {ZeltReadyFailedError | ZeltLifecycleStateError} */
  async createRunner(schedulers: readonly SchedulerClass[]): Promise<SchedulerRunner> {
    const resolver = {
      get: <T extends object>(cls: new (...args: never[]) => T): T => resolve(this.container, cls),
    };
    const runner = createSchedulerRunner(schedulers, resolver);
    this.lifecycleManager.register({
      startup: (): void => {},
      shutdown: async (): Promise<void> => {
        if (runner.isRunning()) await runner.shutdown();
      },
    });
    // Registration happens after LifecycleManager.startup() has already run during
    // runtime.ready(); without startupPending() the entry stays pending and
    // LifecycleManager.shutdown() would skip it, leaving cron timers alive.
    await this.lifecycleManager.startupPending();
    return runner;
  }
}
