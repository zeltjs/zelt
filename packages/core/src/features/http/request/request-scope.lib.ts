import type { CapturedContext } from '../../../kernel';
import {
  createContextKey,
  createContextScope,
  getInternal,
  hasContext,
  setInternal,
} from '../../../kernel';
import type { RequestContext } from '../middleware/middleware.types';

export const REQUEST_ROOT = /* @__PURE__ */ createContextKey<Request>('zelt:request-root');
export const REQUEST_STORE_CREATOR = /* @__PURE__ */ createContextKey<symbol>(
  'zelt:request-store-creator',
);
const REQUEST_EXECUTION =
  /* @__PURE__ */ createContextKey<RequestContext>('zelt:request-execution');

const scopes = new WeakMap<RequestContext, CapturedContext>();

export const getRequestScope = (ctx: RequestContext): CapturedContext | undefined =>
  scopes.get(ctx);

export const attachRequestScope = (ctx: RequestContext, scope: CapturedContext): void => {
  scopes.set(ctx, scope);
};

/** @throws {ZeltContextNotAvailableError} */
export const isCurrentRequest = (ctx: RequestContext): boolean =>
  hasContext() && getInternal(REQUEST_EXECUTION) === ctx;

/** @throws {ZeltContextNotAvailableError | TypeError} */
export const runInRequestContext = <T>(ctx: RequestContext, fn: () => T): T => {
  let scope = scopes.get(ctx);
  if (!scope) {
    scope = createContextScope({
      inherit: !hasContext() || getInternal(REQUEST_ROOT) === undefined,
    });
    scopes.set(ctx, scope);
  }
  return scope.run(() => {
    // Context identity also separates executions that reuse one Request object.
    setInternal(REQUEST_EXECUTION, ctx);
    return fn();
  });
};
