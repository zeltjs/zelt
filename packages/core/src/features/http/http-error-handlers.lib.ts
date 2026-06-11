import type { Container } from '@needle-di/core';

import { resolve } from '../../kernel';
import type {
  ErrorHandlerClass,
  ErrorHandlerInstance,
  RequestContext,
} from './middleware/middleware.types';

// Bubbling falls out of Hono's composition: a rethrown error crosses into
// the parent router's compose layer and reaches the parent's onError. Only
// the request root (the router that created the context store) may not
// rethrow, so it owns the default fallback.
/** @throws {Error} */
export const createRouterErrorHandler =
  (
    errorHandlers: readonly ErrorHandlerInstance[],
    fallback: ErrorHandlerInstance,
    isRequestRoot: () => boolean,
  ) =>
  /** @throws {Error} */
  async (err: Error, c: RequestContext): Promise<Response> => {
    for (const handler of errorHandlers) {
      const result = await handler.onError(err, c);
      if (result) return result;
    }
    if (!isRequestRoot() && err instanceof Error) throw err;
    const fallbackResult = await fallback.onError(err, c);
    return (
      fallbackResult ??
      Response.json({ code: 'INTERNAL_ERROR', message: 'internal server error' }, { status: 500 })
    );
  };

export const resolveErrorHandlers = (
  classes: readonly ErrorHandlerClass[],
  container: Container,
): ErrorHandlerInstance[] => classes.map((cls) => resolve(container, cls));
