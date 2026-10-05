import type { ResolverHandle } from '../../../kernel';
import { preserveResponseIsolation } from '../response/response-ownership.feature';
import type { HonoMiddleware, MiddlewareInput } from './middleware.types';
import { resolveMiddleware } from './middleware-guard.lib';

// User middleware may retain a response reference before outer middleware runs.
// Establish isolation at its execution boundary, after skip has been decided.
/** @throws {TypeError | ZeltContextNotAvailableError | ZeltLifecycleStateError} */
export const resolveIsolatedMiddleware = (
  input: MiddlewareInput,
  resolver: ResolverHandle,
): HonoMiddleware => {
  const middleware = resolveMiddleware(input, resolver);
  return (ctx, next) => {
    preserveResponseIsolation(ctx);
    return middleware(ctx, next);
  };
};
