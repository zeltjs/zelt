import { inject } from '@zeltjs/core';

import type { DatabaseService } from './database-service';

type DatabaseServiceClass<T> = new (...args: never[]) => DatabaseService<T>;

// biome-ignore lint/suspicious/noExplicitAny: required for TC39 decorator type compatibility
type AnyAsyncFn = (...args: any[]) => Promise<any>;

export function createTransactionDecorator<T>(serviceClass: DatabaseServiceClass<T>) {
  return function Transaction() {
    return <M extends AnyAsyncFn>(originalMethod: M, _context: ClassMethodDecoratorContext): M =>
      async function (this: unknown, ...args: Parameters<M>) {
        const service = inject(serviceClass);
        return service.withTransaction(() => originalMethod.apply(this, args)) as ReturnType<M>;
      } as M;
  };
}
