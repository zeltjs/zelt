import type { ConfiguredFeature } from '../feature.types';
import { SCHEDULER_OPTIONS, SchedulerService } from './scheduler.service';
import type { SchedulerClass } from './scheduler.types';
import type { JobInfo } from './scheduler-runner.lib';

export type SchedulerCapabilities = {
  readonly startScheduler: () => Promise<void>;
  readonly stopScheduler: () => Promise<void>;
  readonly isSchedulerRunning: () => boolean;
  readonly getSchedulerJobs: () => readonly JobInfo[];
};

export const scheduler = (
  schedulers: readonly SchedulerClass[],
): ConfiguredFeature<'schedulers', SchedulerCapabilities> => ({
  key: 'schedulers',
  bind: (container) => {
    container.bind({ provide: SCHEDULER_OPTIONS, useValue: schedulers });
  },
  staticCapabilities: () => ({}),
  createCapabilities: async (runtime) => {
    const service = await runtime.get(SchedulerService);
    return {
      startScheduler: () => service.startScheduler(),
      stopScheduler: () => service.stopScheduler(),
      isSchedulerRunning: () => service.isSchedulerRunning(),
      getSchedulerJobs: () => service.getSchedulerJobs(),
    };
  },
});
