import type { Context } from 'hono';
import { matchedRoutes } from 'hono/route';
import { findTargetHandler } from 'hono/utils/handler';

import type { ResolverHandle } from '../../../kernel';
import { createContextKey, getInternal, setInternal } from '../../../kernel';
import type {
  FunctionMiddleware,
  MiddlewareClass,
  MiddlewareIdentifier,
  MiddlewareInput,
  MiddlewareInputWithOptions,
} from './middleware.types';

const SKIPPED_MIDDLEWARES = Symbol('zelt:skipped-middlewares');

const hasUseMethod = (proto: unknown): boolean => {
  if (proto === null || proto === undefined) return false;
  if (typeof proto !== 'object') return false;
  return typeof Reflect.get(proto, 'use') === 'function';
};

const checkMiddlewareClass = (input: MiddlewareInput): boolean =>
  typeof input === 'function' && input.prototype !== undefined && hasUseMethod(input.prototype);

const checkMiddlewareWithOptions = (input: MiddlewareInput): boolean => {
  if (!Array.isArray(input)) return false;
  const tuple: MiddlewareInputWithOptions = input;
  return checkMiddlewareClass(tuple[0]);
};

function narrowToWithOptions(middleware: MiddlewareInput): MiddlewareInputWithOptions;
function narrowToWithOptions(middleware: MiddlewareInput): MiddlewareInput {
  return middleware;
}

function narrowToClass(middleware: MiddlewareInput): MiddlewareClass;
function narrowToClass(middleware: MiddlewareInput): MiddlewareInput {
  return middleware;
}

function narrowToFunction(middleware: MiddlewareInput): FunctionMiddleware;
function narrowToFunction(middleware: MiddlewareInput): MiddlewareInput {
  return middleware;
}

// Skip declarations reference the class (or function) itself, so a
// [class, options] tuple must collapse to the class for identity checks.
export const middlewareIdentity = (input: MiddlewareInput): MiddlewareIdentifier => {
  if (checkMiddlewareWithOptions(input)) return narrowToWithOptions(input)[0];
  if (checkMiddlewareClass(input)) return narrowToClass(input);
  return narrowToFunction(input);
};

/** @throws {ZeltLifecycleStateError} */
export const resolveMiddleware = (
  middleware: MiddlewareInput,
  resolver: ResolverHandle,
): FunctionMiddleware => {
  if (checkMiddlewareWithOptions(middleware)) {
    const [mwClass, options] = narrowToWithOptions(middleware);
    const instance = resolver.get(mwClass);
    return (c, next) => instance.use(c, next, options);
  }
  if (checkMiddlewareClass(middleware)) {
    const mwClass = narrowToClass(middleware);
    const instance = resolver.get(mwClass);
    return (c, next) => instance.use(c, next, undefined);
  }
  return narrowToFunction(middleware);
};

export const attachSkippedMiddlewares = (
  handler: object,
  skipped: ReadonlySet<MiddlewareIdentifier>,
): void => {
  Reflect.set(handler, SKIPPED_MIDDLEWARES, skipped);
};

const findSkippedMiddlewares = (c: Context): ReadonlySet<unknown> | undefined => {
  for (const route of matchedRoutes(c)) {
    // route() mounting may wrap handlers for error-handler scoping;
    // findTargetHandler unwraps to the function the skip set was attached to.
    const skipped: unknown = Reflect.get(findTargetHandler(route.handler), SKIPPED_MIDDLEWARES);
    if (skipped instanceof Set) return skipped;
  }
  return undefined;
};

// Skip is decided here, at execution time, against the matched endpoint's
// declaration — registration never filters middlewares, so inherited (use)
// and route-chained middlewares share a single skip semantics.
export const guardMiddleware = (
  identifier: MiddlewareIdentifier,
  middleware: FunctionMiddleware,
): FunctionMiddleware => {
  return async (c, next) => {
    const skipped = findSkippedMiddlewares(c);
    if (skipped?.has(identifier)) return next();
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
  middleware: FunctionMiddleware,
): FunctionMiddleware => {
  return (c, next) => {
    const applied = getInternal(APPLIED_MIDDLEWARES) ?? new Set<MiddlewareIdentifier>();
    if (applied.has(identifier)) return next();
    setInternal(APPLIED_MIDDLEWARES, new Set([...applied, identifier]));
    return middleware(c, next);
  };
};
