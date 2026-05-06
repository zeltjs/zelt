import { appendScheduleMetadata } from '../internal/scheduler-metadata';

type EveryOptions =
  | { readonly minutes: number; readonly seconds?: never }
  | { readonly seconds: number; readonly minutes?: never };

export const Every =
  (options: EveryOptions): MethodDecorator =>
  (target, propertyKey): void => {
    if (typeof target === 'function') {
      throw new Error('@Every cannot be applied to static methods');
    }

    const cronExpression =
      options.seconds !== undefined
        ? `*/${options.seconds} * * * * *`
        : `*/${options.minutes} * * * *`;

    appendScheduleMetadata(target.constructor, {
      methodName: propertyKey,
      cronExpression,
    });
  };
