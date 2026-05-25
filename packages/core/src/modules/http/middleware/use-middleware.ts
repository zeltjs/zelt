import { createClassDecorator, createMethodDecorator } from '@zeltjs/decorator-metadata';
import { match, P } from 'ts-pattern';

import { ZeltDecoratorUsageError } from '../../../kernel/errors';
import type { MiddlewareInput } from './types';

const tc39ClassPattern = { kind: 'class' as const, metadata: P.nonNullable };

// `UseMiddleware` is valid as either a class or method decorator under TC39
// (and as either form under legacy decorators). The overloaded signature lets
// TypeScript pick the right shape at each call site.
type UseMiddlewareFn = {
  // TC39 class
  <T extends abstract new (...args: never[]) => unknown>(
    value: T,
    context: ClassDecoratorContext,
  ): void;
  // TC39 method
  (value: (...args: never[]) => unknown, context: ClassMethodDecoratorContext): void;
  // Legacy class
  <T extends new (...args: never[]) => unknown>(target: T): T | undefined;
  // Legacy method
  (target: object, propertyKey: string | symbol, descriptor?: PropertyDescriptor): void;
};

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const UseMiddleware = (...middlewares: MiddlewareInput[]): UseMiddlewareFn => {
  const props = { decorator: 'UseMiddleware' as const, middlewares };
  const classDecorate = createClassDecorator(props);
  const methodDecorate = createMethodDecorator(props, {
    rejectStatic: () =>
      new ZeltDecoratorUsageError({ decoratorName: 'UseMiddleware', reason: 'static_method' }),
  });

  function dispatch(...args: unknown[]): unknown {
    const isClassDecorator = match(args[1])
      .with(P.nullish, () => true)
      .with(tc39ClassPattern, () => true)
      .otherwise(() => false);
    const fn = isClassDecorator
      ? (classDecorate as unknown as (...args: unknown[]) => unknown)
      : (methodDecorate as unknown as (...args: unknown[]) => unknown);
    return fn(...args);
  }
  const fn = dispatch as unknown as UseMiddlewareFn;
  return fn;
};
