import { Container, InjectionToken } from '@needle-di/core';
import type { Lifecycle } from '../../kernel';
import { Injectable, inject, LifecycleManager, resolve } from '../../kernel';
import type { SchedulerClass } from './scheduler.types';
import type { JobInfo, SchedulerRunner } from './scheduler-runner.lib';
import { createSchedulerRunner } from './scheduler-runner.lib';

export const SCHEDULER_OPTIONS = new InjectionToken<readonly SchedulerClass[]>('SCHEDULER_OPTIONS');

@Injectable()
export class SchedulerService implements Lifecycle<{ runner: SchedulerRunner }> {
  private readonly ready;

  constructor(
    private readonly schedulers: readonly SchedulerClass[] = inject(SCHEDULER_OPTIONS),
    private readonly container: Container = inject(Container),
    private readonly lifecycleManager: LifecycleManager = inject(LifecycleManager),
  ) {
    this.ready = this.lifecycleManager.register(this);
  }

  /** @throws {ZeltNotImplementedError} */
  async startup(): Promise<{ runner: SchedulerRunner }> {
    const resolver = {
      get: <T extends object>(cls: new (...args: never[]) => T): T => resolve(this.container, cls),
    };
    return { runner: createSchedulerRunner(this.schedulers, resolver) };
  }

  async shutdown(): Promise<void> {
    if (this.ready.runner.isRunning()) {
      await this.ready.runner.shutdown();
    }
  }

  async startScheduler(): Promise<void> {
    if (!this.ready.runner.isRunning()) {
      await this.ready.runner.startup();
    }
  }

  async stopScheduler(): Promise<void> {
    if (this.ready.runner.isRunning()) {
      await this.ready.runner.shutdown();
    }
  }

  isSchedulerRunning(): boolean {
    return this.ready.runner.isRunning();
  }

  getSchedulerJobs(): readonly JobInfo[] {
    return this.ready.runner.getJobs();
  }
}
