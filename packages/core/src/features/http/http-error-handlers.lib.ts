import type { Container } from '@needle-di/core';

import { resolve } from '../../kernel';
import type {
  ErrorHandlerClass,
  ErrorHandlerInstance,
  RequestContext,
} from './middleware/middleware.types';
import { renderReplyResult } from './response/response-rendering.feature';

const defaultInternalError = (): Response =>
  Response.json({ code: 'INTERNAL_ERROR', message: 'internal server error' }, { status: 500 });

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
      const rendered = renderReplyResult(c, result);
      if (rendered) return rendered;
    }
    if (!isRequestRoot() && err instanceof Error) throw err;
    const fallbackResult = renderReplyResult(c, await fallback.onError(err, c));
    return fallbackResult ?? defaultInternalError();
  };

export const resolveErrorHandlers = (
  classes: readonly ErrorHandlerClass[],
  container: Container,
): ErrorHandlerInstance[] => classes.map((cls) => resolve(container, cls));
