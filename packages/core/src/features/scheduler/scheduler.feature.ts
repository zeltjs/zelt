import type { Container } from '@needle-di/core';

import { Feature } from '../feature.types';
import type { FeatureRuntime } from '../feature.types';
import { SCHEDULER_OPTIONS, SchedulerService } from './scheduler.service';
import type { SchedulerClass } from './scheduler.types';
import type { JobInfo } from './scheduler-runner.lib';

export type SchedulerCapabilities = {
  readonly startScheduler: () => Promise<void>;
  readonly stopScheduler: () => Promise<void>;
  readonly isSchedulerRunning: () => boolean;
  readonly getSchedulerJobs: () => readonly JobInfo[];
};

export class SchedulerFeature extends Feature<'schedulers', SchedulerCapabilities> {
  readonly key = 'schedulers' as const;

  constructor(private readonly schedulers: readonly SchedulerClass[]) {
    super();
  }

  readonly bind = (container: Container): void => {
    container.bind({ provide: SCHEDULER_OPTIONS, useValue: this.schedulers });
  };

  readonly staticCapabilities = (): Record<never, never> => {
    return {};
  };

  readonly createCapabilities = async (
    runtime: FeatureRuntime,
  ): Promise<SchedulerCapabilities> => {
    const service = await runtime.get(SchedulerService);
    return {
      startScheduler: () => service.startScheduler(),
      stopScheduler: () => service.stopScheduler(),
      isSchedulerRunning: () => service.isSchedulerRunning(),
      getSchedulerJobs: () => service.getSchedulerJobs(),
    };
  };
}

export const scheduler = (schedulers: readonly SchedulerClass[]): SchedulerFeature =>
  new SchedulerFeature(schedulers);
