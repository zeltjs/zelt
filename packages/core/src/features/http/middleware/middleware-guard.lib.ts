import type { Context } from 'hono';
import { matchedRoutes } from 'hono/route';
import { findTargetHandler } from 'hono/utils/handler';

import type { ResolverHandle } from '../../../kernel';
import { createContextKey, getInternal, setInternal } from '../../../kernel';
import type { HonoMiddleware, MiddlewareIdentifier, MiddlewareInput } from './middleware.types';

const SKIPPED_MIDDLEWARES = Symbol('zelt:skipped-middlewares');

export type SkippedMiddlewareSets = {
  readonly classLevel: ReadonlySet<MiddlewareIdentifier>;
  readonly methodLevel: ReadonlySet<MiddlewareIdentifier>;
};

type MiddlewareSkipScope = 'default' | 'method';

const hasUseMethod = (proto: unknown): boolean => {
  if (proto === null || proto === undefined) return false;
  if (typeof proto !== 'object') return false;
  return typeof Reflect.get(proto, 'use') === 'function';
};

const checkMiddlewareClass = (input: MiddlewareInput): boolean =>
  typeof input === 'function' && input.prototype !== undefined && hasUseMethod(input.prototype);

export const middlewareIdentity = (input: MiddlewareInput): MiddlewareIdentifier => {
  if (typeof input === 'function') return input;
  return input.middleware;
};

/** @throws {ZeltLifecycleStateError | TypeError} */
export const resolveMiddleware = (
  middleware: MiddlewareInput,
  resolver: ResolverHandle,
): HonoMiddleware => {
  if (typeof middleware === 'function') {
    if (!checkMiddlewareClass(middleware)) {
      throw new TypeError('Invalid middleware class. Missing use() method.');
    }
    const instance = resolver.get(middleware);
    return async (_c, next) => await instance.use(next);
  }
  if (!checkMiddlewareClass(middleware.middleware)) {
    throw new TypeError('Invalid middleware class. Missing use() method.');
  }
  const instance = resolver.get(middleware.middleware);
  return async (_c, next) => await instance.use(next, middleware.options);
};

export const attachSkippedMiddlewares = (handler: object, skipped: SkippedMiddlewareSets): void => {
  Reflect.set(handler, SKIPPED_MIDDLEWARES, skipped);
};

// Read-side counterpart of SkippedMiddlewareSets: values cross the handler
// symbol boundary as unknown, and instanceof can only recover Set<unknown>.
type FoundSkippedSets = {
  readonly classLevel: ReadonlySet<unknown>;
  readonly methodLevel: ReadonlySet<unknown>;
};

const findSkippedMiddlewares = (c: Context): FoundSkippedSets | undefined => {
  for (const route of matchedRoutes(c)) {
    // route() mounting may wrap handlers for error-handler scoping;
    // findTargetHandler unwraps to the function the skip set was attached to.
    const skipped: unknown = Reflect.get(findTargetHandler(route.handler), SKIPPED_MIDDLEWARES);
    if (typeof skipped !== 'object' || skipped === null) continue;
    const classLevel: unknown = Reflect.get(skipped, 'classLevel');
    const methodLevel: unknown = Reflect.get(skipped, 'methodLevel');
    if (classLevel instanceof Set && methodLevel instanceof Set) {
      return { classLevel, methodLevel };
    }
  }
  return undefined;
};

const shouldSkipMiddleware = (
  skipped: FoundSkippedSets | undefined,
  identifier: MiddlewareIdentifier,
  scope: MiddlewareSkipScope,
): boolean => {
  if (!skipped) return false;
  if (scope === 'method') return skipped.methodLevel.has(identifier);
  return skipped.classLevel.has(identifier) || skipped.methodLevel.has(identifier);
};

// Skip is decided here, at execution time, against the matched endpoint's
// declaration — registration never filters middlewares, so inherited (use)
// and route-chained middlewares share a single skip semantics.
export const guardMiddleware = (
  identifier: MiddlewareIdentifier,
  middleware: HonoMiddleware,
  options?: { readonly skipScope?: MiddlewareSkipScope },
): HonoMiddleware => {
  return async (c, next) => {
    const skipped = findSkippedMiddlewares(c);
    if (shouldSkipMiddleware(skipped, identifier, options?.skipScope ?? 'default')) return next();
    const result = await middleware(c, next);
    if (result instanceof Response) {
      c.res = result;
    }
  };
};

const APPLIED_MIDDLEWARES = createContextKey<Set<MiddlewareIdentifier>>('zelt:applied-middlewares');

// Every router level registers the built-in security middlewares; this guard
// keeps one identity to one run per request regardless of nesting depth.
/** @throws {ZeltContextNotAvailableError} */
export const oncePerRequest = (
  identifier: MiddlewareIdentifier,
  middleware: HonoMiddleware,
): HonoMiddleware => {
  return (c, next) => {
    const existing = getInternal(APPLIED_MIDDLEWARES);
    if (existing) {
      if (existing.has(identifier)) return next();
      existing.add(identifier);
    } else {
      setInternal(APPLIED_MIDDLEWARES, new Set([identifier]));
    }
    return middleware(c, next);
  };
};
