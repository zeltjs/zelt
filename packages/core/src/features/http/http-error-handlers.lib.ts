import type { Container } from '@needle-di/core';

import { resolve } from '../../kernel';
import type {
  ErrorHandlerClass,
  ErrorHandlerInstance,
  RequestContext,
} from './middleware/middleware.types';

export const createErrorHandler =
  (errorHandlers: readonly ErrorHandlerInstance[], fallback: ErrorHandlerInstance) =>
  async (err: Error, c: RequestContext): Promise<Response> => {
    for (const handler of errorHandlers) {
      const result = await handler.onError(err, c);
      if (result) return result;
    }
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
