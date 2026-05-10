import { LifecycleManager } from '../lifecycle';
import { createSchedulerRunner, type SchedulerRunner } from '../scheduler/runner';

import type { SchedulerClass } from './types';

type Resolver = { get: <T extends object>(cls: new (...args: never[]) => T) => T };

export type SchedulerReadyOptions = {
  readonly schedulers: readonly SchedulerClass[] | undefined;
  readonly resolver: Resolver;
  readonly lifecycle: LifecycleManager;
};

export const schedulerReady = (options: SchedulerReadyOptions): SchedulerRunner | undefined => {
  const { schedulers, resolver, lifecycle } = options;
  if (!schedulers || schedulers.length === 0) return undefined;
  const runner = createSchedulerRunner(schedulers, resolver);
  lifecycle.register(runner);
  return runner;
};
