import type { LifecycleManager } from '../../kernel';
import { ContextRuntimeService, getInternal, hasContext, setInternal } from '../../kernel';
import type { HonoMiddleware } from './middleware/middleware.types';
import {
  attachRequestScope,
  getRequestScope,
  REQUEST_ROOT,
  REQUEST_STORE_CREATOR,
  runInRequestContext,
} from './request';
import {
  flushAfterResponseCallbacks,
  initializeAfterResponseCallbacks,
} from './request/after-response.feature';

// Identifies which router's bootstrap created the request context store.
// The creator is the request root: the only error-handling level that must
// not rethrow, since no parent router exists above it.
const STORE_CREATOR = REQUEST_STORE_CREATOR;
const ROOT_REQUEST = REQUEST_ROOT;

// The request context store must exist before any middleware runs (setUser
// etc. write into it). Only the outermost router actually creates the store;
// nested routers see an existing store and stay transparent.
/** @throws {AggregateError | ZeltContextNotAvailableError | ZeltLifecycleStateError | ZeltReadyFailedError | TypeError} */
export const createBootstrapMiddleware = (
  lifecycle: LifecycleManager,
  routerToken: symbol,
  onAfterResponseError?: (error: unknown) => void,
  waitUntil?: (promise: Promise<void>) => void,
  contextRuntime: ContextRuntimeService = new ContextRuntimeService(),
): HonoMiddleware => {
  return async (c, next) => {
    // A Zelt context may exist (e.g. event handler, test harness) without
    // being a request-scoped store. Only skip when STORE_CREATOR is set,
    // meaning a parent HTTP router already bootstrapped this same request.
    const existing = getRequestScope(c);
    const bootstrapped = existing?.run(
      () => getInternal(STORE_CREATOR) !== undefined && getInternal(ROOT_REQUEST) === c.req.raw,
    );
    if (bootstrapped) {
      await runInRequestContext(c, next);
      return;
    }
    const inherit = !hasContext() || getInternal(STORE_CREATOR) === undefined;
    const scope = contextRuntime.createScope(inherit);
    attachRequestScope(c, scope);
    await lifecycle.startupPending();

    /** @throws {ZeltContextNotAvailableError} */
    async function run(): Promise<void> {
      setInternal(STORE_CREATOR, routerToken);
      setInternal(ROOT_REQUEST, c.req.raw);
      initializeAfterResponseCallbacks();
      try {
        await next();
      } finally {
        scope.run(() => {
          const flushed = flushAfterResponseCallbacks(onAfterResponseError);
          try {
            waitUntil?.(flushed);
          } catch (error) {
            onAfterResponseError?.(error);
          }
        });
      }
    }

    await runInRequestContext(c, run);
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
