import { resolveMethodArgs } from '../../internal/decorator-context';
import { appendPendingScheduleMetadata } from '../internal/scheduler-metadata';

type CronOptions = {
  readonly tz?: string;
};

export const Cron =
  (expression: string, options?: CronOptions) =>
  (...args: unknown[]): void => {
    const { pendingKey, methodName, isStatic } = resolveMethodArgs(args);
    if (isStatic) {
      throw new Error('@Cron cannot be applied to static methods');
    }
    appendPendingScheduleMetadata(pendingKey, {
      methodName,
      cronExpression: expression,
      ...(options?.tz !== undefined ? { timezone: options.tz } : {}),
    });
  };
