import type { LifecycleManager } from '../../kernel';
import {
  createContextKey,
  getInternal,
  hasContext,
  runInContext,
  runInRootContext,
  setInternal,
} from '../../kernel';
import type { FunctionMiddleware } from './middleware/middleware.types';

// Identifies which router's bootstrap created the request context store.
// The creator is the request root: the only error-handling level that must
// not rethrow, since no parent router exists above it.
const STORE_CREATOR = createContextKey<symbol>('zelt:request-store-creator');
const ROOT_REQUEST = createContextKey<Request>('zelt:request-root');

// The request context store must exist before any middleware runs (setUser
// etc. write into it). Only the outermost router actually creates the store;
// nested routers see an existing store and stay transparent.
/** @throws {ZeltContextNotAvailableError | ZeltLifecycleStateError | ZeltReadyFailedError} */
export const createBootstrapMiddleware = (
  lifecycle: LifecycleManager,
  routerToken: symbol,
): FunctionMiddleware => {
  return async (c, next) => {
    // A Zelt context may exist (e.g. event handler, test harness) without
    // being a request-scoped store. Only skip when STORE_CREATOR is set,
    // meaning a parent HTTP router already bootstrapped this same request.
    if (
      hasContext() &&
      getInternal(STORE_CREATOR) !== undefined &&
      getInternal(ROOT_REQUEST) === c.req.raw
    ) {
      await next();
      return;
    }
    await lifecycle.startupPending();

    const run = async (): Promise<void> => {
      setInternal(STORE_CREATOR, routerToken);
      setInternal(ROOT_REQUEST, c.req.raw);
      await next();
    };

    if (hasContext() && getInternal(STORE_CREATOR) !== undefined) {
      await runInRootContext(run);
      return;
    }

    await runInContext(run);
  };
};

// Errors raised before the store exists can only belong to the request
// root: every nested router runs inside its parent's store.
/** @throws {ZeltContextNotAvailableError} */
export const createRequestRootChecker = (routerToken: symbol): (() => boolean) => {
  return () => {
    if (!hasContext()) return true;
    const storeCreator = getInternal(STORE_CREATOR);
    return storeCreator === undefined || storeCreator === routerToken;
  };
};
