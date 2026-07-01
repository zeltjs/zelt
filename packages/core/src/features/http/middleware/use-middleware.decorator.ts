import type { ClassDecoratorFn, MethodDecoratorFn } from '@zeltjs/decorator-metadata';
import { createClassDecorator, createMethodDecorator } from '@zeltjs/decorator-metadata';
import { toUnknownCallable } from '@zeltjs/unsafe-type-lib';
import { match, P } from 'ts-pattern';

import { ZeltDecoratorUsageError } from '../../../kernel';
import type { MiddlewareClass } from './middleware.types';

const tc39ClassPattern = { kind: 'class' as const, metadata: P.nonNullable };

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

  function dispatch<T extends abstract new (...args: never[]) => unknown>(
    value: T,
    context: ClassDecoratorContext,
  ): void;
  function dispatch(
    value: (...args: never[]) => unknown,
    context: ClassMethodDecoratorContext,
  ): void;
  function dispatch<T extends new (...args: never[]) => unknown>(target: T): T | undefined;
  function dispatch(
    target: object,
    propertyKey: string | symbol,
    descriptor?: PropertyDescriptor,
  ): void;
  function dispatch(...args: unknown[]): unknown {
    const isClassDecorator = match(args[1])
      .with(P.nullish, () => true)
      .with(tc39ClassPattern, () => true)
      .otherwise(() => false);
    const fn = isClassDecorator
      ? toUnknownCallable(classDecorate)
      : toUnknownCallable(methodDecorate);
    return fn(...args);
  }
  return dispatch;
}
