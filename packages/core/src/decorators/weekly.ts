import { resolveMethodArgs } from '../internal/decorator-context';
import { appendPendingScheduleMetadata } from '../internal/scheduler-metadata';

type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

type WeeklyOptions = {
  readonly day: DayOfWeek;
  readonly hour: number;
  readonly minute?: number;
  readonly tz?: string;
};

const dayToCron: Record<DayOfWeek, string> = {
  sunday: '0',
  monday: '1',
  tuesday: '2',
  wednesday: '3',
  thursday: '4',
  friday: '5',
  saturday: '6',
};

export const Weekly =
  (options: WeeklyOptions) =>
  (...args: unknown[]): void => {
    const { pendingKey, methodName, isStatic } = resolveMethodArgs(args);
    if (isStatic) {
      throw new Error('@Weekly cannot be applied to static methods');
    }
    const minute = options.minute ?? 0;
    const cronDay = dayToCron[options.day];
    const cronExpression = `${minute} ${options.hour} * * ${cronDay}`;
    appendPendingScheduleMetadata(pendingKey, {
      methodName,
      cronExpression,
      ...(options.tz !== undefined ? { timezone: options.tz } : {}),
    });
  };
