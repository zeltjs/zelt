import { Container } from '@needle-di/core';
import { Injectable, inject, resolve } from '../../kernel';
import type { SchedulerClass } from './scheduler.types';
import type { SchedulerRunner } from './scheduler-runner.lib';
import { createSchedulerRunner } from './scheduler-runner.lib';

export type { SchedulerRunner } from './scheduler-runner.lib';

@Injectable()
export class SchedulerService {
  constructor(private readonly container: Container = inject(Container)) {}

  createRunner(schedulers: readonly SchedulerClass[]): SchedulerRunner {
    const resolver = {
      get: <T extends object>(cls: new (...args: never[]) => T): T => resolve(this.container, cls),
    };
    return createSchedulerRunner(schedulers, resolver);
  }
}
