import type { Context, Env, Input } from 'hono';
import type { LifecycleManager, ResolverHandle } from '../../../kernel';
import {
  hasContext,
  runInContext,
  ZeltDecoratorUsageError,
  ZeltRouteConfigurationError,
} from '../../../kernel';
import type { SkippedMiddlewareSets } from '../middleware';
import {
  attachSkippedMiddlewares,
  guardMiddleware,
  middlewareIdentity,
  resolveMiddleware,
} from '../middleware';
import { currentRoles, currentUser } from '../middleware/auth';
import type { HonoMiddleware, MiddlewareInput } from '../middleware/middleware.types';
import { setHonoContext } from '../request';
import { hasBodySource, setBodySource, setPathParams } from '../request/injection';
import { joinPath } from './path-utils.lib';
import type { ControllerClass, HttpMethod } from './routing-metadata.lib';
import {
  getAuthorizedMetadata,
  getControllerMetadata,
  getControllerMiddlewareMetadata,
  getControllerSkipMiddlewareMetadata,
  getMethodMiddlewareMetadata,
  getRouteMetadata,
  getSkipMiddlewareMetadata,
} from './routing-metadata.lib';

export { joinPath };

type MiddlewareContext = Context<Env, string, Input>;
type RouteHandler = (c: MiddlewareContext) => Promise<Response>;
type HonoRouter = {
  readonly get: (path: string, ...handlers: (HonoMiddleware | RouteHandler)[]) => unknown;
  readonly post: (path: string, ...handlers: (HonoMiddleware | RouteHandler)[]) => unknown;
  readonly put: (path: string, ...handlers: (HonoMiddleware | RouteHandler)[]) => unknown;
  readonly patch: (path: string, ...handlers: (HonoMiddleware | RouteHandler)[]) => unknown;
  readonly delete: (path: string, ...handlers: (HonoMiddleware | RouteHandler)[]) => unknown;
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

/** @throws {ZeltContextNotAvailableError | ZeltLifecycleStateError} */
const createAuthorizationMiddleware = (requiredRoles: readonly string[]): HonoMiddleware => {
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

/** @throws {ZeltContextNotAvailableError | ZeltLifecycleStateError | TypeError} */
const collectRouteMiddlewares = (
  controllerClass: ControllerClass,
  methodName: string | symbol,
  resolver: ResolverHandle,
): HonoMiddleware[] => {
  const controllerMeta = getControllerMiddlewareMetadata(controllerClass);
  const methodMetas = getMethodMiddlewareMetadata(controllerClass).filter(
    (m) => m.methodName === methodName,
  );
  const authorizedMeta = getAuthorizedMetadata(controllerClass, methodName);

  const controllerInputs: MiddlewareInput[] = [...(controllerMeta?.flat() ?? [])];
  const methodInputs: MiddlewareInput[] = methodMetas.flatMap((m) => m.middlewares);

  const guarded = controllerInputs.map((input) =>
    guardMiddleware(middlewareIdentity(input), resolveMiddleware(input, resolver)),
  );
  guarded.push(
    ...methodInputs.map((input) =>
      guardMiddleware(middlewareIdentity(input), resolveMiddleware(input, resolver), {
        skipScope: 'method',
      }),
    ),
  );

  if (authorizedMeta) {
    guarded.push(createAuthorizationMiddleware(authorizedMeta.roles));
  }

  return guarded;
};

const collectSkippedMiddlewares = (
  controllerClass: ControllerClass,
  methodName: string | symbol,
): SkippedMiddlewareSets => ({
  classLevel: new Set(getControllerSkipMiddlewareMetadata(controllerClass)),
  methodLevel: new Set(
    getSkipMiddlewareMetadata(controllerClass)
      .filter((m) => m.methodName === methodName)
      .flatMap((m) => m.skipped),
  ),
});

// Populates the request context store before route-chained middlewares and
// the controller run. The router-level request injection normally ran
// earlier; this re-applies path params for the matched route (parent routers
// only see their mount-level params) and keeps bare buildRoutes() usage
// working by registering the lazy body source when nothing registered it yet.
/** @throws {ZeltContextNotAvailableError | BadRequestException} */
const createInjectionMiddleware = (): HonoMiddleware => {
  return async (c, next) => {
    /** @throws {ZeltContextNotAvailableError | BadRequestException} */
    const run = async (): Promise<void> => {
      setHonoContext(c);
      if (!hasBodySource()) {
        setBodySource({
          contentType: c.req.header('content-type') ?? '',
          request: c.req.raw.clone(),
        });
      }
      setPathParams(c.req.param());
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

/** @throws {ZeltContextNotAvailableError | ZeltLifecycleStateError | BadRequestException | TypeError} */
const registerRoute = (hono: HonoRouter, ctx: RouteBuilderContext, route: Route): void => {
  const middlewares = collectRouteMiddlewares(
    route.controllerClass,
    route.methodName,
    ctx.resolver,
  );

  /** @throws {AggregateError | ZeltContextNotAvailableError | ZeltReadyFailedError | ZeltLifecycleStateError | ZeltRouteConfigurationError} */
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

/** @throws {ZeltContextNotAvailableError | ZeltDecoratorUsageError | ZeltLifecycleStateError | BadRequestException | TypeError} */
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
