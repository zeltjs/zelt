import { createMethodDecorator } from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../../kernel/errors';

type EveryOptions =
  | { readonly minutes: number; readonly seconds?: never }
  | { readonly seconds: number; readonly minutes?: never };

/** @throws {E} */
export const Every = (options: EveryOptions) => {
  const cronExpression =
    options.seconds !== undefined
      ? `*/${options.seconds} * * * * *`
      : `*/${options.minutes} * * * *`;
  return createMethodDecorator({ decorator: 'Schedule' as const, cronExpression } as const, {
    rejectStatic: () =>
      new ZeltDecoratorUsageError({ decoratorName: 'Every', reason: 'static_method' }),
  });
};
