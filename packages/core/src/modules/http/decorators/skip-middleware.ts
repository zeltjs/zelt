import { createMethodDecorator } from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../../kernel/errors';
import type { MiddlewareIdentifier } from '../middleware/types';

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const SkipMiddleware = (...skipped: MiddlewareIdentifier[]) =>
  createMethodDecorator({ decorator: 'SkipMiddleware' as const, skipped } as const, {
    rejectStatic: () =>
      new ZeltDecoratorUsageError({ decoratorName: 'SkipMiddleware', reason: 'static_method' }),
  });
