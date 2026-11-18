import { inject } from '@zeltjs/core';

import type { DatabaseService } from './database.service';

type DatabaseServiceClass<T> = new (...args: never[]) => DatabaseService<T>;

// biome-ignore lint/suspicious/noExplicitAny: required for TC39 decorator type compatibility
type AnyAsyncFn = (...args: any[]) => Promise<any>;

export function createTransactionDecorator<T>(serviceClass: DatabaseServiceClass<T>) {
  return function Transaction() {
    return <M extends AnyAsyncFn>(originalMethod: M, context: ClassMethodDecoratorContext): M => {
      // inject() only works while the container is constructing the instance,
      // so the service is captured at construction rather than at call time.
      const services = new WeakMap<object, DatabaseService<T>>();
      context.addInitializer(function (this: unknown) {
        services.set(this as object, inject<DatabaseService<T>>(serviceClass));
      });

      return async function (this: unknown, ...args: Parameters<M>) {
        const service = services.get(this as object);
        if (service === undefined) {
          throw new Error(
            `@Transaction() method "${String(context.name)}" was called on an instance that was not constructed through dependency injection`,
          );
        }
        return service.withTransaction(() => originalMethod.apply(this, args)) as ReturnType<M>;
      } as M;
    };
  };
}
