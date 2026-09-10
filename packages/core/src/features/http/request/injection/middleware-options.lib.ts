import { DEFERRED_VALUE_TYPE, unsafeResolveDeferredValue } from '@zeltjs/unsafe-type-lib';

import {
  createContextKey,
  getInternal,
  setInternal,
  ZeltMiddlewareOptionsUnavailableError,
} from '../../../../kernel';
import type {
  MiddlewareOptionsClass,
  MiddlewareOptionsOf,
} from '../../middleware/middleware.types';

// Keyed by the underlying class, not the binding: middlewareOptions() is called by
// self-reference (middlewareOptions(RateLimitMiddleware)) from inside that class's own
// use(), so at the point it reads, it only ever has the class to look up.
const MIDDLEWARE_OPTIONS =
  createContextKey<Map<MiddlewareOptionsClass, unknown>>('zelt:middleware-options');

// The store erases each middleware's options to `unknown`; this phantom handle
// (mirrors ValueTypeHandle in middleware-value.lib.ts) lets unsafeResolveDeferredValue
// narrow it back to the caller's inferred TOptions without an inline `as`.
class OptionsTypeHandle<T> {
  declare [DEFERRED_VALUE_TYPE]: T;
}

/** @throws {ZeltContextNotAvailableError} */
const getOrCreateStore = (): Map<MiddlewareOptionsClass, unknown> => {
  const existing = getInternal(MIDDLEWARE_OPTIONS);
  if (existing) return existing;
  const created = new Map<MiddlewareOptionsClass, unknown>();
  setInternal(MIDDLEWARE_OPTIONS, created);
  return created;
};

// Called by the middleware guard right before a bound middleware's use() runs.
// The Map is one shared object per request (context nesting copies key
// bindings, not the Map a key points at), while one onion chain can hold two
// bindings of the same class — so isolation comes from save/restore, not
// context nesting: the caller must invoke the returned callback in a `finally`
// around the WHOLE use() call, or after next() the outer binding would read
// the inner binding's options.
/** @throws {ZeltContextNotAvailableError} */
export const recordMiddlewareOptions = (
  middlewareClass: MiddlewareOptionsClass,
  options: unknown,
): (() => void) => {
  const store = getOrCreateStore();
  const hadPrevious = store.has(middlewareClass);
  const previous = store.get(middlewareClass);
  store.set(middlewareClass, options);
  return () => {
    if (hadPrevious) {
      store.set(middlewareClass, previous);
    } else {
      store.delete(middlewareClass);
    }
  };
};

// Constrained to MiddlewareOptionsClass, which must not require use() — see
// its comment for the self-reference cycle a use() requirement creates.
/** @throws {ZeltContextNotAvailableError | ZeltMiddlewareOptionsUnavailableError} */
export const middlewareOptions = <M extends MiddlewareOptionsClass>(
  middleware: M,
): MiddlewareOptionsOf<M> => {
  const store = getInternal(MIDDLEWARE_OPTIONS);
  if (!store?.has(middleware)) {
    throw new ZeltMiddlewareOptionsUnavailableError({ middlewareName: middleware.name });
  }
  return unsafeResolveDeferredValue(
    new OptionsTypeHandle<MiddlewareOptionsOf<M>>(),
    store.get(middleware),
  );
};
