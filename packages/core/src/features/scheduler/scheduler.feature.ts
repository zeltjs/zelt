import type { ServiceResolver } from '../../app';
import { Feature } from '../../app';
import { SchedulerService } from './scheduler.service';
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

  readonly featureClasses = (): readonly SchedulerClass[] => {
    return this.schedulers;
  };

  readonly blueprint = (): Record<never, never> => {
    return {};
  };

  readonly realize = async (resolver: ServiceResolver): Promise<SchedulerCapabilities> => {
    const service = await resolver.get(SchedulerService);
    const runner = service.createRunner(this.schedulers);
    return {
      startScheduler: async () => {
        if (!runner.isRunning()) await runner.startup();
      },
      stopScheduler: async () => {
        if (runner.isRunning()) await runner.shutdown();
      },
      isSchedulerRunning: () => runner.isRunning(),
      getSchedulerJobs: () => runner.getJobs(),
    };
  };
}

export const scheduler = (schedulers: readonly SchedulerClass[]): SchedulerFeature =>
  new SchedulerFeature(schedulers);
