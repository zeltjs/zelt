import type { LifecycleManager } from '../../kernel';
import { createContextKey, getInternal, hasContext, runInContext, setInternal } from '../../kernel';
import type { FunctionMiddleware } from './middleware/middleware.types';

// Identifies which router's bootstrap created the request context store.
// The creator is the request root: the only error-handling level that must
// not rethrow, since no parent router exists above it.
const STORE_CREATOR = createContextKey<symbol>('zelt:request-store-creator');

// The request context store must exist before any middleware runs (setUser
// etc. write into it). Only the outermost router actually creates the store;
// nested routers see an existing store and stay transparent.
/** @throws {ZeltContextNotAvailableError | ZeltLifecycleStateError | ZeltReadyFailedError} */
export const createBootstrapMiddleware = (
  lifecycle: LifecycleManager,
  routerToken: symbol,
): FunctionMiddleware => {
  return async (_c, next) => {
    if (hasContext()) {
      await next();
      return;
    }
    await lifecycle.startupPending();
    await runInContext(async () => {
      setInternal(STORE_CREATOR, routerToken);
      await next();
    });
  };
};

// Errors raised before the store exists can only belong to the request
// root: every nested router runs inside its parent's store.
/** @throws {ZeltContextNotAvailableError} */
export const createRequestRootChecker = (routerToken: symbol): (() => boolean) => {
  return () => !hasContext() || getInternal(STORE_CREATOR) === routerToken;
};
