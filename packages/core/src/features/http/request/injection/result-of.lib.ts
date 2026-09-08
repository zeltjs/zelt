import { DEFERRED_VALUE_TYPE, unsafeResolveDeferredValue } from '@zeltjs/unsafe-type-lib';

import {
  createContextKey,
  getInternal,
  setInternal,
  ZeltMiddlewareResultUnavailableError,
} from '../../../../kernel';
import type {
  BoundMiddleware,
  MiddlewareClass,
  MiddlewareIdentifier,
} from '../../middleware/middleware.types';

// Matching against `Next<infer T>` directly cannot recover T: Next<void> has no
// parameter for T to occur in, so TS cannot infer through it. Matching the
// parameter shape works for value-providing middleware, but a value-less
// `next: () => Promise<void>` still matches with no inference site, leaving T
// as void — so exactly-void (and unknown, its no-signal sibling) must collapse
// to never: middleware that provides nothing has no readable result. The check
// must be EXACT (double conditional): plain `[T] extends [void]` also captures
// T = undefined, and Next<undefined> is a real "provides explicit undefined"
// contract whose result must stay readable as `undefined`.
export type MiddlewareResultOf<M> = M extends {
  use(next: (value: infer T) => unknown, ...args: never[]): unknown;
}
  ? // biome-ignore lint/suspicious/noConfusingVoidType: void vs undefined is the point of this check; biome's unsafe fix to `undefined` breaks never-collapsing
    [T] extends [void]
    ? [void] extends [T]
      ? never
      : T
    : unknown extends T
      ? never
      : T
  : never;

const middlewareDisplayName = (middleware: MiddlewareIdentifier): string =>
  typeof middleware === 'function' ? middleware.name : middleware.middleware.name;

const MIDDLEWARE_RESULTS =
  createContextKey<Map<MiddlewareIdentifier, unknown>>('zelt:middleware-results');

// The store erases each middleware's result to `unknown`; this phantom handle
// (mirrors ContextKey in context-key.lib.ts) lets unsafeResolveDeferredValue
// narrow it back to the caller's inferred T without an inline `as`.
class ResultTypeHandle<T> {
  declare [DEFERRED_VALUE_TYPE]: T;
}

// Written only by middleware-guard.lib.ts: it wraps the next() passed into
// instance.use() and calls this when next() is invoked with a value.
/** @throws {ZeltContextNotAvailableError} */
export const recordMiddlewareResult = (identifier: MiddlewareIdentifier, value: unknown): void => {
  const store = getInternal(MIDDLEWARE_RESULTS);
  if (store) {
    store.set(identifier, value);
    return;
  }
  setInternal(MIDDLEWARE_RESULTS, new Map([[identifier, value]]));
};

// Two overloads, not one generic over MiddlewareIdentifier: a bare class and a
// binding resolve their instance type differently (InstanceType<M> vs
// InstanceType<M['middleware']>), and keeping them separate gives each call
// site a precise signature instead of a single loosely-inferred one.
export function resultOf<M extends MiddlewareClass>(
  middleware: M,
): MiddlewareResultOf<InstanceType<M>>;
export function resultOf<M extends BoundMiddleware>(
  middleware: M,
): MiddlewareResultOf<InstanceType<M['middleware']>>;
/** @throws {ZeltContextNotAvailableError | ZeltMiddlewareResultUnavailableError} */
export function resultOf(middleware: MiddlewareIdentifier): unknown {
  const store = getInternal(MIDDLEWARE_RESULTS);
  if (!store?.has(middleware)) {
    throw new ZeltMiddlewareResultUnavailableError({
      middlewareName: middlewareDisplayName(middleware),
    });
  }
  return unsafeResolveDeferredValue(new ResultTypeHandle<unknown>(), store.get(middleware));
}
