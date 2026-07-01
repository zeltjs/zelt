import type { MiddlewareInstance, Next } from '@zeltjs/core';
import { inject, Middleware } from '@zeltjs/core';

import type { DatabaseService } from './database.service';

type DatabaseServiceClass<T> = new (...args: never[]) => DatabaseService<T>;

type TransactionMiddlewareClass = new () => MiddlewareInstance;

export function createTransactionMiddleware<T>(
  serviceClass: DatabaseServiceClass<T>,
): TransactionMiddlewareClass {
  @Middleware
  class TransactionMiddleware implements MiddlewareInstance {
    constructor(private service: DatabaseService<T> = inject(serviceClass)) {}

    use(next: Next): Promise<Response | undefined> {
      return this.service.withTransaction(() => next()).then(() => undefined);
    }
  }
  return TransactionMiddleware;
}
