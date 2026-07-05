import type { ClassDecoratorFn, MethodDecoratorFn } from '@zeltjs/decorator-metadata';
import {
  createClassDecorator,
  createMethodDecorator,
  dispatchClassOrMethodDecorator,
} from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../../kernel';
import type { MiddlewareClass } from './middleware.types';

const toMiddlewareInput = <TOptions>(
  middleware: MiddlewareClass<TOptions>,
  options: [] | [TOptions],
) => {
  if (options.length === 0) return middleware;
  return { middleware, options: options[0] };
};

export function UseMiddleware(
  middleware: MiddlewareClass<undefined>,
): ClassDecoratorFn & MethodDecoratorFn;
export function UseMiddleware<TOptions>(
  middleware: MiddlewareClass<TOptions>,
  options: TOptions,
): ClassDecoratorFn & MethodDecoratorFn;
/** @throws {E} */
export function UseMiddleware<TOptions>(
  middleware: MiddlewareClass<TOptions>,
  ...options: [] | [TOptions]
): ClassDecoratorFn & MethodDecoratorFn {
  const props = {
    decorator: 'UseMiddleware' as const,
    middlewares: [toMiddlewareInput(middleware, options)],
  };
  const classDecorate = createClassDecorator(props);
  const methodDecorate = createMethodDecorator(props, {
    rejectStatic: () =>
      new ZeltDecoratorUsageError({ decoratorName: 'UseMiddleware', reason: 'static_method' }),
  });

  return dispatchClassOrMethodDecorator(classDecorate, methodDecorate);
}
