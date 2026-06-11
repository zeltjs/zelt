import type { Context, Env, Input } from 'hono';
import type { LifecycleManager, ResolverHandle } from '../../../kernel';
import {
  hasContext,
  runInContext,
  ZeltDecoratorUsageError,
  ZeltRouteConfigurationError,
} from '../../../kernel';
import { BadRequestException } from '../http.exceptions';
import {
  attachSkippedMiddlewares,
  guardMiddleware,
  middlewareIdentity,
  resolveMiddleware,
} from '../middleware';
import { currentRoles, currentUser } from '../middleware/auth';
import type {
  FunctionMiddleware,
  MiddlewareIdentifier,
  MiddlewareInput,
} from '../middleware/middleware.types';
import { setHonoContext } from '../request';
import { setBody, setPathParams } from '../request/injection';
import { joinPath } from './path-utils.lib';
import type { ControllerClass, HttpMethod } from './routing-metadata.lib';
import {
  getAuthorizedMetadata,
  getControllerMetadata,
  getControllerMiddlewareMetadata,
  getMethodMiddlewareMetadata,
  getRouteMetadata,
  getSkipMiddlewareMetadata,
} from './routing-metadata.lib';

export { joinPath };

type MiddlewareContext = Context<Env, string, Input>;
type RouteHandler = (c: MiddlewareContext) => Promise<Response>;
type HonoRouter = {
  readonly get: (path: string, ...handlers: (FunctionMiddleware | RouteHandler)[]) => unknown;
  readonly post: (path: string, ...handlers: (FunctionMiddleware | RouteHandler)[]) => unknown;
  readonly put: (path: string, ...handlers: (FunctionMiddleware | RouteHandler)[]) => unknown;
  readonly patch: (path: string, ...handlers: (FunctionMiddleware | RouteHandler)[]) => unknown;
  readonly delete: (path: string, ...handlers: (FunctionMiddleware | RouteHandler)[]) => unknown;
};

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

/** @throws {BadRequestException} */
const parseRequestBody = async (c: MiddlewareContext): Promise<ParsedBody> => {
  const contentType = c.req.header('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const val = await c.req.json<unknown>().catch((e: Error) => {
      throw new BadRequestException({ reason: `Invalid JSON: ${e.message}` });
    });
    return { type: 'json', val };
  }

  if (
    contentType.includes('multipart/form-data') ||
    contentType.includes('application/x-www-form-urlencoded')
  ) {
    const val: FormBody = await c.req.parseBody({ all: true }).catch((e: Error) => {
      throw new BadRequestException({ reason: `Invalid form data: ${e.message}` });
    });
    return { type: 'form', val };
  }

  if (contentType.startsWith('text/')) {
    const val = await c.req.text().catch((e: Error) => {
      throw new BadRequestException({ reason: `Invalid text body: ${e.message}` });
    });
    return { type: 'text', val };
  }

  return { type: 'none', val: undefined };
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
  controllerClass: ControllerClass,
  methodName: string | symbol,
  resolver: ResolverHandle,
): FunctionMiddleware[] => {
  const controllerMeta = getControllerMiddlewareMetadata(controllerClass);
  const methodMetas = getMethodMiddlewareMetadata(controllerClass).filter(
    (m) => m.methodName === methodName,
  );
  const authorizedMeta = getAuthorizedMetadata(controllerClass, methodName);

  const inputs: MiddlewareInput[] = [
    ...(controllerMeta?.flat() ?? []),
    ...methodMetas.flatMap((m) => m.middlewares),
  ];

  const guarded = inputs.map((input) =>
    guardMiddleware(middlewareIdentity(input), resolveMiddleware(input, resolver)),
  );

  if (authorizedMeta) {
    guarded.push(createAuthorizationMiddleware(authorizedMeta.roles));
  }

  return guarded;
};

const collectSkippedMiddlewares = (
  controllerClass: ControllerClass,
  methodName: string | symbol,
): ReadonlySet<MiddlewareIdentifier> =>
  new Set(
    getSkipMiddlewareMetadata(controllerClass)
      .filter((m) => m.methodName === methodName)
      .flatMap((m) => m.skipped),
  );

// Populates the request context store before route-chained middlewares and
// the controller run. The store itself normally comes from the router-level
// bootstrap; creating one here keeps bare buildRoutes() usage working.
/** @throws {ZeltContextNotAvailableError | BadRequestException} */
const createInjectionMiddleware = (): FunctionMiddleware => {
  return async (c, next) => {
    const body = await parseRequestBody(c);
    const pathParams: Readonly<Record<string, string>> = c.req.param();
    /** @throws {ZeltContextNotAvailableError} */
    const run = async (): Promise<void> => {
      setHonoContext(c);
      setBody(body);
      setPathParams(pathParams);
      await next();
    };
    if (hasContext()) {
      await run();
      return;
    }
    await runInContext(run);
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

/** @throws {ZeltContextNotAvailableError | ZeltLifecycleStateError | BadRequestException} */
const registerRoute = (hono: HonoRouter, ctx: RouteBuilderContext, route: Route): void => {
  const middlewares = collectRouteMiddlewares(
    route.controllerClass,
    route.methodName,
    ctx.resolver,
  );

  /** @throws {ZeltContextNotAvailableError | ZeltReadyFailedError | ZeltLifecycleStateError | ZeltRouteConfigurationError} */
  const handler = async (c: MiddlewareContext): Promise<Response> => {
    const instance = getOrCreateInstance(ctx, route.controllerClass);
    await ctx.lifecycle.startupPending();

    const invoke = resolveHandler(instance, route.methodName);
    const result = await invoke();
    if (result instanceof Response) return result;
    return c.json(result);
  };

  attachSkippedMiddlewares(
    handler,
    collectSkippedMiddlewares(route.controllerClass, route.methodName),
  );

  const chain = [createInjectionMiddleware(), ...middlewares];
  const methods = {
    GET: () => hono.get(route.fullPath, ...chain, handler),
    POST: () => hono.post(route.fullPath, ...chain, handler),
    PUT: () => hono.put(route.fullPath, ...chain, handler),
    PATCH: () => hono.patch(route.fullPath, ...chain, handler),
    DELETE: () => hono.delete(route.fullPath, ...chain, handler),
  } as const;

  methods[route.method]();
};

export type BuildRoutesOptions = {
  readonly hono: HonoRouter;
  readonly controllers: readonly ControllerClass[];
  readonly resolver: ResolverHandle;
  readonly lifecycle: LifecycleManager;
};

/** @throws {ZeltContextNotAvailableError | ZeltDecoratorUsageError | ZeltLifecycleStateError | BadRequestException} */
export const buildRoutes = (options: BuildRoutesOptions): void => {
  const ctx: RouteBuilderContext = {
    resolver: options.resolver,
    lifecycle: options.lifecycle,
    instanceCache: new Map(),
  };

  for (const route of collectRoutes(options.controllers)) {
    registerRoute(options.hono, ctx, route);
  }
};
