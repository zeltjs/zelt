import { appendScheduleMetadata } from '../internal/scheduler-metadata';

type HourlyOptions = {
  readonly minute?: number;
  readonly tz?: string;
};

export const Hourly =
  (options?: HourlyOptions): MethodDecorator =>
  (target, propertyKey): void => {
    if (typeof target === 'function') {
      throw new Error('@Hourly cannot be applied to static methods');
    }
    const minute = options?.minute ?? 0;
    const cronExpression = `${minute} * * * *`;
    appendScheduleMetadata(target.constructor, {
      methodName: propertyKey,
      cronExpression,
      ...(options?.tz !== undefined ? { timezone: options.tz } : {}),
    });
  };
