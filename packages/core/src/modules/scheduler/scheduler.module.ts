import type { Module } from '../module.types';
import { SCHEDULER_OPTIONS, SchedulerService } from './scheduler.service';
import type { SchedulerClass } from './scheduler.types';
import type { JobInfo } from './scheduler-runner.lib';

export type SchedulerCapabilities = {
  readonly startScheduler: () => Promise<void>;
  readonly stopScheduler: () => Promise<void>;
  readonly isSchedulerRunning: () => boolean;
  readonly getSchedulerJobs: () => readonly JobInfo[];
};

export type SchedulerModule = typeof SchedulerModule;
export const SchedulerModule: Module<
  'schedulers',
  readonly SchedulerClass[],
  SchedulerCapabilities
> = {
  key: 'schedulers',
  bind: (container, schedulers) => {
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
};
