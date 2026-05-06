import { appendScheduleMetadata } from '../internal/scheduler-metadata';

type DailyOptions = {
  readonly hour: number;
  readonly minute?: number;
  readonly tz?: string;
};

export const Daily =
  (options: DailyOptions): MethodDecorator =>
  (target, propertyKey): void => {
    if (typeof target === 'function') {
      throw new Error('@Daily cannot be applied to static methods');
    }
    const minute = options.minute ?? 0;
    const cronExpression = `${minute} ${options.hour} * * *`;
    appendScheduleMetadata(target.constructor, {
      methodName: propertyKey,
      cronExpression,
      ...(options.tz !== undefined ? { timezone: options.tz } : {}),
    });
  };
