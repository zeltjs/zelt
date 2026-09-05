import type { ClassDecoratorFn, MethodDecoratorFn } from '@zeltjs/decorator-metadata';
import {
  createClassDecorator,
  createMethodDecorator,
  dispatchClassOrMethodDecorator,
} from '@zeltjs/decorator-metadata';

import { ZeltDecoratorUsageError } from '../../../kernel';
import type {
  AnyMiddlewareWithOptionsClass,
  BoundMiddleware,
  MiddlewareClass,
} from './middleware.types';
import type { MiddlewareWithOptions } from './middleware-with-options.lib';

// Middleware requiring options must always go through .with(); the bare class
// is only accepted here when it either isn't a MiddlewareWithOptions subclass
// at all, or is one declared with undefined options (options optional). This
// has to be a generic conditional on the candidate M, not a plain type: only
// inference through M (not a fixed shape) can single out "this particular
// candidate's own TOptions" and reject it when it's neither of those cases.
type MiddlewareLike<M extends MiddlewareClass> = M extends new (
  ...args: never[]
) => MiddlewareWithOptions<infer TOptions>
  ? undefined extends TOptions
    ? M
    : never
  : M;

/** @throws {E} */
const registerMiddleware = (
  middleware: MiddlewareClass | BoundMiddleware,
): ClassDecoratorFn & MethodDecoratorFn => {
  const props = {
    decorator: 'UseMiddleware' as const,
    middlewares: [middleware],
  };
  const classDecorate = createClassDecorator(props);
  const methodDecorate = createMethodDecorator(props, {
    rejectStatic: () =>
      new ZeltDecoratorUsageError({ decoratorName: 'UseMiddleware', reason: 'static_method' }),
  });

  return dispatchClassOrMethodDecorator(classDecorate, methodDecorate);
};

export function UseMiddleware<TClass extends AnyMiddlewareWithOptionsClass>(
  middleware: BoundMiddleware<TClass>,
): ClassDecoratorFn & MethodDecoratorFn;
export function UseMiddleware<M extends MiddlewareClass>(
  middleware: MiddlewareLike<M>,
): ClassDecoratorFn & MethodDecoratorFn;
/**
 * @throws {ZeltDecoratorUsageError}
 * @throws {E}
 */
export function UseMiddleware(
  middleware: MiddlewareClass | BoundMiddleware,
): ClassDecoratorFn & MethodDecoratorFn {
  return registerMiddleware(middleware);
}
