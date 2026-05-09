import { resolveMethodArgs } from '../internal/decorator-context';
import { appendPendingScheduleMetadata } from '../internal/scheduler-metadata';

type HourlyOptions = {
  readonly minute?: number;
  readonly tz?: string;
};

export const Hourly =
  (options?: HourlyOptions) =>
  (...args: unknown[]): void => {
    const { pendingKey, methodName, isStatic } = resolveMethodArgs(args);
    if (isStatic) {
      throw new Error('@Hourly cannot be applied to static methods');
    }
    const minute = options?.minute ?? 0;
    const cronExpression = `${minute} * * * *`;
    appendPendingScheduleMetadata(pendingKey, {
      methodName,
      cronExpression,
      ...(options?.tz !== undefined ? { timezone: options.tz } : {}),
    });
  };
