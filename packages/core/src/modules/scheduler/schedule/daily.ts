import { createMethodDecorator } from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../../kernel/errors';

type DailyOptions = {
  readonly hour: number;
  readonly minute?: number;
  readonly tz?: string;
};

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const Daily = (options: DailyOptions) => {
  const minute = options.minute ?? 0;
  const cronExpression = `${minute} ${options.hour} * * *`;
  return createMethodDecorator(
    {
      decorator: 'Schedule' as const,
      cronExpression,
      ...(options.tz !== undefined ? { timezone: options.tz } : {}),
    } as const,
    {
      rejectStatic: () =>
        new ZeltDecoratorUsageError({ decoratorName: 'Daily', reason: 'static_method' }),
    },
  );
};
