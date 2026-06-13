import { Container } from '@needle-di/core';
import { Injectable, inject, LifecycleManager, resolve } from '../../kernel';
import type { SchedulerClass } from './scheduler.types';
import type { SchedulerRunner } from './scheduler-runner.lib';
import { createSchedulerRunner } from './scheduler-runner.lib';

export type { SchedulerRunner } from './scheduler-runner.lib';

@Injectable()
export class SchedulerService {
  // Ledger of runners this service must release on shutdown; registering the
  // lifecycle in the constructor keeps it inside the resolve→startupPending
  // contract of AppBootstrap.get, so no manual startupPending call is needed.
  private readonly runners: SchedulerRunner[] = [];

  constructor(
    private readonly container: Container = inject(Container),
    lifecycleManager: LifecycleManager = inject(LifecycleManager),
  ) {
    lifecycleManager.register({
      startup: (): void => {},
      shutdown: async (): Promise<void> => {
        for (const runner of this.runners) {
          if (runner.isRunning()) await runner.shutdown();
        }
      },
    });
  }

  createRunner(schedulers: readonly SchedulerClass[]): SchedulerRunner {
    const resolver = {
      get: <T extends object>(cls: new (...args: never[]) => T): T => resolve(this.container, cls),
    };
    const runner = createSchedulerRunner(schedulers, resolver);
    this.runners.push(runner);
    return runner;
  }
}
