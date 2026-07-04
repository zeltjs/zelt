import type { ClassDecoratorFn, MethodDecoratorFn } from '@zeltjs/decorator-metadata';
import {
  createClassDecorator,
  createMethodDecorator,
  dispatchClassOrMethodDecorator,
} from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../../kernel';
import type { MiddlewareIdentifier } from './middleware.types';

/** @throws {E} */
export const SkipMiddleware = (
  ...skipped: MiddlewareIdentifier[]
): ClassDecoratorFn & MethodDecoratorFn => {
  const props = { decorator: 'SkipMiddleware' as const, skipped } as const;
  const classDecorate = createClassDecorator(props);
  const methodDecorate = createMethodDecorator(props, {
    rejectStatic: () =>
      new ZeltDecoratorUsageError({ decoratorName: 'SkipMiddleware', reason: 'static_method' }),
  });

  return dispatchClassOrMethodDecorator(classDecorate, methodDecorate);
};
