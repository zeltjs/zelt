import { Cron } from 'croner';

import type { Lifecycle } from '../../kernel';
import { getScheduledMetadata, getScheduleMetadata } from './scheduler-metadata.lib';
import type { SchedulerClass } from './scheduler.types';

type Resolver = { get: <T extends object>(cls: new (...args: never[]) => T) => T };

export type JobInfo = {
  readonly name: string;
  readonly cronExpression: string;
  readonly timezone: string | undefined;
};

export type SchedulerRunner = Lifecycle & {
  readonly isRunning: () => boolean;
  readonly getJobs: () => readonly JobInfo[];
};

export const createSchedulerRunner = (
  schedulerClasses: readonly SchedulerClass[],
  resolver: Resolver,
): SchedulerRunner => {
  const jobs: Cron[] = [];
  const jobInfos: JobInfo[] = [];
  let running = false;

  /** @throws {ZeltLifecycleStateError} */
  const startup = async (): Promise<void> => {
    if (running) return;

    for (const schedulerClass of schedulerClasses) {
      if (!getScheduledMetadata(schedulerClass)) {
        continue;
      }

      const instance = resolver.get(schedulerClass);
      const schedules = getScheduleMetadata(schedulerClass);

      for (const schedule of schedules) {
        const methodName = schedule.methodName;
        const method: unknown = Reflect.get(instance, methodName);

        if (typeof method !== 'function') {
          continue;
        }

        const cronOptions = schedule.timezone !== undefined ? { timezone: schedule.timezone } : {};
        const job = new Cron(schedule.cronExpression, cronOptions, () => {
          void Promise.resolve(method.call(instance));
        });

        jobs.push(job);
        jobInfos.push({
          name: String(methodName),
          cronExpression: schedule.cronExpression,
          timezone: schedule.timezone,
        });
      }
    }

    running = true;
  };

  const shutdown = async (): Promise<void> => {
    for (const job of jobs) {
      job.stop();
    }
    jobs.length = 0;
    running = false;
  };

  const isRunning = (): boolean => running;

  const getJobs = (): readonly JobInfo[] => jobInfos;

  return { startup, shutdown, isRunning, getJobs };
};
