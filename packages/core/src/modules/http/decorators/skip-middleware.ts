import { defineMethodDecorator } from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../../kernel/errors';
import { captureStackTraceForCore } from '../../../kernel/internal/decorator-position';
import type { MiddlewareIdentifier } from '../middleware/types';

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const SkipMiddleware = (...skipped: MiddlewareIdentifier[]) =>
  defineMethodDecorator(
    captureStackTraceForCore(),
    { decorator: 'SkipMiddleware' as const, skipped } as const,
    {
      rejectStatic: () =>
        new ZeltDecoratorUsageError({ decoratorName: 'SkipMiddleware', reason: 'static_method' }),
    },
  );
