import { defineMethodDecorator } from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../errors';
import { captureStackTraceForCore } from '../../internal/decorator-position';

type EveryOptions =
  | { readonly minutes: number; readonly seconds?: never }
  | { readonly seconds: number; readonly minutes?: never };

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const Every = (options: EveryOptions) => {
  const cronExpression =
    options.seconds !== undefined
      ? `*/${options.seconds} * * * * *`
      : `*/${options.minutes} * * * *`;
  return defineMethodDecorator(
    captureStackTraceForCore(),
    { decorator: 'Schedule' as const, cronExpression } as const,
    {
      rejectStatic: () =>
        new ZeltDecoratorUsageError({ decoratorName: 'Every', reason: 'static_method' }),
    },
  );
};
