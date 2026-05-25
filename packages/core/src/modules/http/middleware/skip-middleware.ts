import { createMethodDecorator } from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../../kernel/errors';
import type { MiddlewareIdentifier } from './types';

/** @throws {E} */
export const SkipMiddleware = (...skipped: MiddlewareIdentifier[]) =>
  createMethodDecorator({ decorator: 'SkipMiddleware' as const, skipped } as const, {
    rejectStatic: () =>
      new ZeltDecoratorUsageError({ decoratorName: 'SkipMiddleware', reason: 'static_method' }),
  });
