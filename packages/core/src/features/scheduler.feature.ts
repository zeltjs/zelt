import type { SchedulerCapabilities } from '../modules/scheduler/scheduler.module';
import { SCHEDULER_OPTIONS, SchedulerService } from '../modules/scheduler/scheduler.service';
import type { SchedulerClass } from '../modules/scheduler/scheduler.types';
import type { ConfiguredFeature } from './feature.types';

export type { SchedulerCapabilities };

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
