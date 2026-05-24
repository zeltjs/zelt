import type { Context, Env, Hono, Input } from 'hono';
import { HTTPException } from 'hono/http-exception';

import type { ResolverHandle } from '../../../kernel/di/container';
import {
  ZeltDecoratorUsageError,
  ZeltMiddlewareExecutionError,
  ZeltRouteConfigurationError,
} from '../../../kernel/errors';
import { runInContext } from '../../../kernel/internal/context-key';
import type { LifecycleManager } from '../../../kernel/lifecycle';
import { setBody } from '../request/injection/body';
import { setPathParams } from '../request/injection/path-param';
import { setHonoContext } from '../request/request-context';
import { currentRoles, currentUser } from '../middleware/auth/auth';
import type {
  FunctionMiddleware,
  MiddlewareClass,
  MiddlewareInput,
  MiddlewareInputWithOptions,
} from '../middleware/types';
import type { HttpMethod } from './metadata';
import {
  getAuthorizedMetadata,
  getControllerMetadata,
  getControllerMiddlewareMetadata,
  getMethodMiddlewareMetadata,
  getRouteMetadata,
  getSkipMiddlewareMetadata,
} from './metadata';
import { joinPath } from './path-utils';

export { joinPath };

type MiddlewareContext = Context<Env, string, Input>;

import type { ControllerClass } from '../module';

type Route = {
  readonly method: HttpMethod;
  readonly fullPath: string;
  readonly methodName: string | symbol;
  readonly controllerClass: ControllerClass;
};

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const collectRoutes = (controllers: readonly ControllerClass[]): readonly Route[] => {
  const routes: Route[] = [];
  for (const cls of controllers) {
    const meta = getControllerMetadata(cls);
    if (!meta) {
      throw new ZeltDecoratorUsageError({
        decoratorName: 'Controller',
        reason: 'missing_decorator',
        targetName: cls.name,
      });
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

/** @throws {ZeltLifecycleStateError | ZeltRouteConfigurationError} */
const resolveHandler = (instance: object, methodName: string | symbol): (() => unknown) => {
  // Reflect.get returns `any` for dynamic keys; pinning the local to `unknown`
  // forces narrowing before any call, keeping the handler invocation typesafe.
  const value: unknown = Reflect.get(instance, methodName);
  if (typeof value !== 'function') {
    throw new ZeltRouteConfigurationError({ reason: 'invalid_route' });
  }
  return () => {
    const result: unknown = value.call(instance);
    return result;
  };
};

type FormBody = Record<string, string | File | (string | File)[]>;

type ParsedBody =
  | { type: 'json'; val: unknown }
  | { type: 'form'; val: FormBody }
  | { type: 'text'; val: string }
  | { type: 'none'; val: undefined };

/** @throws {ZeltContextNotAvailableError} */
const parseRequestBody = async (
  c: Parameters<Parameters<Hono['on']>[2]>[0],
): Promise<ParsedBody> => {
  const contentType = c.req.header('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const val = await c.req.json<unknown>().catch((e: Error) => {
      throw new HTTPException(400, { message: `Invalid JSON: ${e.message}` });
    });
    return { type: 'json', val };
  }

  if (
    contentType.includes('multipart/form-data') ||
    contentType.includes('application/x-www-form-urlencoded')
  ) {
    const val: FormBody = await c.req.parseBody({ all: true }).catch((e: Error) => {
      throw new HTTPException(400, { message: `Invalid form data: ${e.message}` });
    });
    return { type: 'form', val };
  }

  if (contentType.startsWith('text/')) {
    const val = await c.req.text().catch((e: Error) => {
      throw new HTTPException(400, { message: `Invalid text body: ${e.message}` });
    });
    return { type: 'text', val };
  }

  return { type: 'none', val: undefined };
};

/** @throws {ZeltLifecycleStateError} */
const hasUseMethod = (proto: unknown): boolean => {
  if (proto === null || proto === undefined) return false;
  if (typeof proto !== 'object') return false;
  return typeof Reflect.get(proto, 'use') === 'function';
};

/** @throws {ZeltLifecycleStateError} */
const checkMiddlewareClass = (input: MiddlewareInput): boolean =>
  typeof input === 'function' && input.prototype !== undefined && hasUseMethod(input.prototype);

/** @throws {ZeltLifecycleStateError} */
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

/** @throws {ZeltLifecycleStateError} */
const resolveMiddleware = (
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

/** @throws {ZeltContextNotAvailableError | ZeltLifecycleStateError} */
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

/** @throws {ZeltContextNotAvailableError | ZeltLifecycleStateError} */
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
    ...(controllerMeta?.flatMap((set) => set.filter((m) => !skippedSet.has(m))) ?? []),
    ...methodMetas.flatMap((m) => m.middlewares.filter((mw) => !skippedSet.has(mw))),
  ];

  const resolvedMiddlewares = allMiddlewares.map((m) => resolveMiddleware(m, resolver));

  if (authorizedMeta) {
    resolvedMiddlewares.push(createAuthorizationMiddleware(authorizedMeta.roles));
  }

  return resolvedMiddlewares;
};

/** @throws {ZeltMiddlewareExecutionError} */
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

    /** @throws {ZeltMiddlewareExecutionError} */
    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) {
        throw new ZeltMiddlewareExecutionError({
          reason: 'next_called_multiple_times',
          middlewareName: middlewares[index]?.name || '<anonymous>',
        });
      }
      index = i;
      if (i < middlewares.length) {
        const mw = middlewares[i];
        if (mw) {
          const result = await mw(c, () => dispatch(i + 1));
          if (result instanceof Response) {
            response = result;
            c.res = result;
          }
        }
      } else {
        response = await finalHandler(c);
        c.res = response;
      }
    };

    await dispatch(0);
    return response ?? c.res;
  };
};

type RouteBuilderContext = {
  readonly resolver: ResolverHandle;
  readonly lifecycle: LifecycleManager;
  readonly instanceCache: Map<ControllerClass, object>;
};

/** @throws {ZeltLifecycleStateError} */
const getOrCreateInstance = (
  ctx: RouteBuilderContext,
  controllerClass: ControllerClass,
): object => {
  const cached = ctx.instanceCache.get(controllerClass);
  if (cached) return cached;
  const instance = ctx.resolver.get(controllerClass);
  ctx.instanceCache.set(controllerClass, instance);
  return instance;
};

/** @throws {ZeltContextNotAvailableError | ZeltLifecycleStateError} */
const registerRoute = (
  hono: Hono,
  ctx: RouteBuilderContext,
  route: Route,
  globalMiddlewares: readonly MiddlewareInput[],
): void => {
  const middlewares = collectRouteMiddlewares(
    globalMiddlewares,
    route.controllerClass,
    route.methodName,
    ctx.resolver,
  );

  /** @throws {ZeltContextNotAvailableError | ZeltLifecycleStateError | ZeltMiddlewareExecutionError | ZeltRouteConfigurationError} */
  const handler = async (c: MiddlewareContext): Promise<Response> => {
    const instance = getOrCreateInstance(ctx, route.controllerClass);
    await ctx.lifecycle.startupPending();

    const invoke = resolveHandler(instance, route.methodName);

    const finalHandler = async (ctx: MiddlewareContext): Promise<Response> => {
      const result = await invoke();
      if (result instanceof Response) return result;
      return ctx.json(result);
    };

    const composedHandler = composeHandler(middlewares, finalHandler);

    const body = await parseRequestBody(c);
    const pathParams: Readonly<Record<string, string>> = c.req.param();
    return runInContext(() => {
      setHonoContext(c);
      setBody(body);
      setPathParams(pathParams);
      return composedHandler(c);
    });
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

export type BuildRoutesOptions = {
  readonly hono: Hono;
  readonly controllers: readonly ControllerClass[];
  readonly resolver: ResolverHandle;
  readonly lifecycle: LifecycleManager;
  readonly globalMiddlewares?: readonly MiddlewareInput[];
};

/** @throws {ZeltContextNotAvailableError | ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const buildRoutes = (options: BuildRoutesOptions): void => {
  const ctx: RouteBuilderContext = {
    resolver: options.resolver,
    lifecycle: options.lifecycle,
    instanceCache: new Map(),
  };

  for (const route of collectRoutes(options.controllers)) {
    registerRoute(options.hono, ctx, route, options.globalMiddlewares ?? []);
  }
};

/** @throws {ZeltLifecycleStateError} */
export const warmupControllers = async (
  controllers: readonly ControllerClass[],
  resolver: ResolverHandle,
  lifecycle: LifecycleManager,
): Promise<void> => {
  for (const cls of controllers) {
    resolver.get(cls);
  }
  await lifecycle.startupPending();
};
