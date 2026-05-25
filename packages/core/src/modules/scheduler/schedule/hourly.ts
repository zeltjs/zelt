import { createMethodDecorator } from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../../kernel/errors';

type HourlyOptions = {
  readonly minute?: number;
  readonly tz?: string;
};

/** @throws {E} */
export const Hourly = (options?: HourlyOptions) => {
  const minute = options?.minute ?? 0;
  const cronExpression = `${minute} * * * *`;
  return createMethodDecorator(
    {
      decorator: 'Schedule' as const,
      cronExpression,
      ...(options?.tz !== undefined ? { timezone: options.tz } : {}),
    } as const,
    {
      rejectStatic: () =>
        new ZeltDecoratorUsageError({ decoratorName: 'Hourly', reason: 'static_method' }),
    },
  );
};
