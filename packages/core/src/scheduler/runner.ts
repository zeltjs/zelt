import { Cron } from 'croner';

import { getScheduledMetadata, getScheduleMetadata } from '../internal/scheduler-metadata';

type SchedulerClass = new (...args: never[]) => object;
type Resolver = { get: <T extends object>(cls: new (...args: never[]) => T) => T };

type JobInfo = {
  readonly name: string;
  readonly cronExpression: string;
  readonly timezone: string | undefined;
};

export type SchedulerRunner = {
  readonly start: () => void;
  readonly stop: () => Promise<void>;
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

  const start = (): void => {
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

  const stop = async (): Promise<void> => {
    for (const job of jobs) {
      job.stop();
    }
    jobs.length = 0;
    running = false;
  };

  const isRunning = (): boolean => running;

  const getJobs = (): readonly JobInfo[] => jobInfos;

  return { start, stop, isRunning, getJobs };
};
