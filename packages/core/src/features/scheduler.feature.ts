import { SCHEDULER_OPTIONS, SchedulerService } from '../modules/scheduler/scheduler.service';
import type { SchedulerClass } from '../modules/scheduler/scheduler.types';
import type { JobInfo } from '../modules/scheduler/scheduler-runner.lib';
import type { ConfiguredFeature } from './feature.types';

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
  resolve: (container) => {
    const service = container.get(SchedulerService);
    return {
      startScheduler: () => service.startScheduler(),
      stopScheduler: () => service.stopScheduler(),
      isSchedulerRunning: () => service.isSchedulerRunning(),
      getSchedulerJobs: () => service.getSchedulerJobs(),
    };
  },
});
