import type { Context, Env, Hono, Input } from 'hono';
import * as v from 'valibot';

import type { FunctionMiddleware, MiddlewareClass, MiddlewareInput } from '../middleware/types';
import { currentRoles, currentUser } from '../primitives/auth';

import type { ResolverHandle } from './container';
import { runInEntryContext } from './entry-context';
import {
  getAuthorizedMetadata,
  getControllerMetadata,
  getControllerMiddlewareMetadata,
  getMethodMiddlewareMetadata,
  getRouteMetadata,
  getSkipMiddlewareMetadata,
  type HttpMethod,
} from './metadata';

type MiddlewareContext = Context<Env, string, Input>;

const stripTrailingSlash = (s: string): string =>
  s.length > 1 && s.endsWith('/') ? s.slice(0, -1) : s;

const ensureLeadingSlash = (s: string): string => (s === '' || s.startsWith('/') ? s : `/${s}`);

export const joinPath = (base: string, sub: string): string => {
  const a = stripTrailingSlash(base);
  const b = stripTrailingSlash(ensureLeadingSlash(sub));
  const joined = `${a}${b === '/' ? '' : b}`;
  return joined === '' ? '/' : joined;
};

type ControllerClass = new (...args: never[]) => object;

type Route = {
  readonly method: HttpMethod;
  readonly fullPath: string;
  readonly methodName: string | symbol;
  readonly controllerClass: ControllerClass;
};

export const collectRoutes = (controllers: readonly ControllerClass[]): readonly Route[] => {
  const routes: Route[] = [];
  for (const cls of controllers) {
    const meta = getControllerMetadata(cls);
    if (!meta) {
      throw new Error('zelt: controller is missing @Controller decorator');
    }
    for (const r of getRouteMetadata(cls)) {
      routes.push({
        method: r.method,
        fullPath: joinPath(meta.basePath, r.path),
        methodName: r.methodName,
        controllerClass: cls,
      });
    }
  }
  return routes;
};

const resolveHandler = (instance: object, methodName: string | symbol): (() => unknown) => {
  // Reflect.get returns `any` for dynamic keys; pinning the local to `unknown`
  // forces narrowing before any call, keeping the handler invocation typesafe.
  const value: unknown = Reflect.get(instance, methodName);
  if (typeof value !== 'function') {
    throw new Error(
      `zelt: route handler ${String(methodName)} is not a function on the controller`,
    );
  }
  return () => {
    const result: unknown = value.call(instance);
    return result;
  };
};

const parseRequestBody = async (c: Parameters<Parameters<Hono['on']>[2]>[0]): Promise<unknown> => {
  const contentType = c.req.header('content-type');
  if (contentType?.includes('application/json') !== true) return undefined;
  return c.req.json<unknown>().catch(() => undefined);
};

const hasUseMethod = (proto: unknown): boolean => {
  if (proto === null || proto === undefined) return false;
  if (typeof proto !== 'object') return false;
  return typeof Reflect.get(proto, 'use') === 'function';
};

const MiddlewareClassSchema = v.custom<MiddlewareClass>(
  (input) =>
    typeof input === 'function' && input.prototype !== undefined && hasUseMethod(input.prototype),
);

const resolveMiddleware = (
  middleware: MiddlewareInput,
  resolver: ResolverHandle,
): FunctionMiddleware => {
  if (v.is(MiddlewareClassSchema, middleware)) {
    const instance = resolver.get(middleware);
    return (c, next) => instance.use(c, next);
  }
  return middleware;
};

const createAuthorizationMiddleware = (requiredRoles: readonly string[]): FunctionMiddleware => {
  return async (_c, next) => {
    const user = currentUser();
    if (user === undefined) {
      return Response.json(
        { code: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 },
      );
    }

    if (requiredRoles.length > 0) {
      const userRoles = currentRoles();
      const hasRequiredRole = requiredRoles.some((role) => userRoles.includes(role));
      if (!hasRequiredRole) {
        return Response.json(
          { code: 'FORBIDDEN', message: 'Insufficient permissions' },
          { status: 403 },
        );
      }
    }

    await next();
    return undefined;
  };
};

const collectRouteMiddlewares = (
  globalMiddlewares: readonly MiddlewareInput[],
  controllerClass: ControllerClass,
  methodName: string | symbol,
  resolver: ResolverHandle,
): FunctionMiddleware[] => {
  const controllerMeta = getControllerMiddlewareMetadata(controllerClass);
  const methodMetas = getMethodMiddlewareMetadata(controllerClass).filter(
    (m) => m.methodName === methodName,
  );
  const skipMetas = getSkipMiddlewareMetadata(controllerClass).filter(
    (m) => m.methodName === methodName,
  );
  const authorizedMeta = getAuthorizedMetadata(controllerClass, methodName);

  const skippedSet = new Set<MiddlewareInput>(skipMetas.flatMap((m) => m.skipped));

  const allMiddlewares: MiddlewareInput[] = [
    ...globalMiddlewares.filter((m) => !skippedSet.has(m)),
    ...(controllerMeta?.middlewares.filter((m) => !skippedSet.has(m)) ?? []),
    ...methodMetas.flatMap((m) => m.middlewares.filter((mw) => !skippedSet.has(mw))),
  ];

  const resolvedMiddlewares = allMiddlewares.map((m) => resolveMiddleware(m, resolver));

  if (authorizedMeta) {
    resolvedMiddlewares.push(createAuthorizationMiddleware(authorizedMeta.roles));
  }

  return resolvedMiddlewares;
};

const composeHandler = (
  middlewares: readonly FunctionMiddleware[],
  finalHandler: (c: MiddlewareContext) => Promise<Response>,
): ((c: MiddlewareContext) => Promise<Response>) => {
  if (middlewares.length === 0) {
    return finalHandler;
  }

  return async (c: MiddlewareContext): Promise<Response> => {
    let index = -1;
    let response: Response | undefined;

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) throw new Error('next() called multiple times');
      index = i;
      if (i < middlewares.length) {
        const mw = middlewares[i];
        if (mw) {
          const result = await mw(c, () => dispatch(i + 1));
          if (result instanceof Response) {
            response = result;
          }
        }
      } else {
        response = await finalHandler(c);
      }
    };

    await dispatch(0);
    return response ?? c.res;
  };
};

const registerRoute = (
  hono: Hono,
  resolver: ResolverHandle,
  route: Route,
  globalMiddlewares: readonly MiddlewareInput[],
): void => {
  const instance = resolver.get(route.controllerClass);
  const invoke = resolveHandler(instance, route.methodName);

  const middlewares = collectRouteMiddlewares(
    globalMiddlewares,
    route.controllerClass,
    route.methodName,
    resolver,
  );

  const finalHandler = async (c: MiddlewareContext): Promise<Response> => {
    const result = await invoke();
    if (result instanceof Response) return result;
    return c.json(result);
  };

  const composedHandler = composeHandler(middlewares, finalHandler);

  const handler = async (c: MiddlewareContext): Promise<Response> => {
    const body = await parseRequestBody(c);
    const pathParams: Readonly<Record<string, string>> = c.req.param();
    return runInEntryContext({ input: { body, pathParams }, honoContext: c }, () =>
      composedHandler(c),
    );
  };

  const methods = {
    GET: () => hono.get(route.fullPath, handler),
    POST: () => hono.post(route.fullPath, handler),
    PUT: () => hono.put(route.fullPath, handler),
    PATCH: () => hono.patch(route.fullPath, handler),
    DELETE: () => hono.delete(route.fullPath, handler),
  } as const;

  methods[route.method]();
};

export const buildRoutes = (
  hono: Hono,
  controllers: readonly ControllerClass[],
  resolver: ResolverHandle,
  globalMiddlewares: readonly MiddlewareInput[] = [],
): void => {
  for (const route of collectRoutes(controllers)) {
    registerRoute(hono, resolver, route, globalMiddlewares);
  }
};
