import { Container } from '@needle-di/core';
import type { Hono } from 'hono';
import { Injectable, inject, LifecycleManager, resolve } from '../../kernel';
import { DefaultErrorHandler } from './error/default.error-handler';
import type {
  ControllerClass,
  HttpChildOptions,
  HttpChildRuntimeInitializer,
  HttpOptions,
} from './http.types';
import { createErrorHandler, resolveErrorHandlers } from './http-error-handlers.lib';
import { CorsMiddleware } from './middleware/cors/cors.middleware';
import type {
  ErrorHandlerClass,
  MiddlewareInput,
  RequestContext,
} from './middleware/middleware.types';
import { SecureHeadersMiddleware } from './middleware/secure-headers/secure-headers.middleware';
import type { ControllerRouteInfo } from './routing';
import { buildRoutes, joinPath } from './routing';

export type { HttpChildOptions, HttpOptions } from './http.types';

export type HttpMetadata = {
  readonly controllers: readonly ControllerRouteInfo[];
};

export type HttpRouter = Hono;

type RouteHandler = (c: RequestContext) => Promise<Response>;

type HonoInstance = Hono;

type RuntimeGet = <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;

type HonoConstructor = typeof import('hono').Hono;

type _HonoConstructorCheck = HonoConstructor extends new (options: {
  readonly strict: boolean;
}) => HonoInstance
  ? true
  : never;

type _HonoInstanceCheck = HonoInstance extends {
  readonly get: (path: string, handler: RouteHandler) => unknown;
  readonly post: (path: string, handler: RouteHandler) => unknown;
  readonly put: (path: string, handler: RouteHandler) => unknown;
  readonly patch: (path: string, handler: RouteHandler) => unknown;
  readonly delete: (path: string, handler: RouteHandler) => unknown;
  readonly onError: (handler: (err: Error, c: RequestContext) => Promise<Response>) => unknown;
  readonly route: (path: string, app: Hono) => unknown;
  readonly fetch: (request: Request) => Response | Promise<Response>;
}
  ? true
  : never;

@Injectable()
export class HttpService {
  constructor(
    private readonly container: Container = inject(Container),
    private readonly lifecycleManager: LifecycleManager = inject(LifecycleManager),
  ) {}

  /** @throws {Error} */
  async buildRouter(options: HttpOptions, get: RuntimeGet): Promise<HttpRouter> {
    try {
      return await this.initializeHono(options, get);
    } catch (cause) {
      throw new Error('HttpService buildRouter failed', { cause });
    }
  }

  /** @throws {ZeltNotImplementedError | ZeltContextNotAvailableError | ZeltDecoratorUsageError | ZeltLifecycleStateError} */
  private async initializeHono(options: HttpOptions, get: RuntimeGet): Promise<HonoInstance> {
    const Hono = await this.loadHonoConstructor();
    const fallbackHandler = resolve(this.container, DefaultErrorHandler);
    const resolver = {
      get: <T extends object>(cls: new (...args: never[]) => T): T => resolve(this.container, cls),
    };

    const securityMiddlewares: readonly MiddlewareInput[] = [
      CorsMiddleware,
      SecureHeadersMiddleware,
    ];
    const rootMiddlewares = [...securityMiddlewares, ...(options.middlewares ?? [])];

    const hono = await this.buildHonoInstance(
      '/',
      options.controllers,
      rootMiddlewares,
      options.errorHandlers ?? [],
      options.children ?? [],
      options.runtimeInitializers ?? [],
      fallbackHandler,
      resolver,
      Hono,
      get,
    );
    return hono;
  }

  private async loadHonoConstructor(): Promise<HonoConstructor> {
    const honoModule = await import('hono');
    return honoModule.Hono;
  }

  /** @throws {ZeltContextNotAvailableError | ZeltDecoratorUsageError} */
  private async runRuntimeInitializers(
    path: string,
    controllers: readonly ControllerClass[],
    router: HonoInstance,
    initializers: readonly HttpChildRuntimeInitializer[],
    get: RuntimeGet,
  ): Promise<void> {
    for (const initializer of initializers) {
      await initializer.initialize({
        path,
        controllers,
        router,
        get,
      });
    }
  }

  private async buildHonoInstance(
    path: string,
    controllers: readonly ControllerClass[],
    middlewares: readonly MiddlewareInput[],
    errorHandlerClasses: readonly ErrorHandlerClass[],
    children: readonly HttpChildOptions[],
    runtimeInitializers: readonly HttpChildRuntimeInitializer[],
    fallbackHandler: InstanceType<typeof DefaultErrorHandler>,
    resolver: { get: <T extends object>(cls: new (...args: never[]) => T) => T },
    Hono: HonoConstructor,
    get: RuntimeGet,
  ): Promise<HonoInstance> {
    const hono = new Hono({ strict: false });

    const errorHandlers = resolveErrorHandlers(errorHandlerClasses, this.container);
    hono.onError(createErrorHandler(errorHandlers, fallbackHandler));

    buildRoutes({
      hono,
      controllers,
      resolver,
      lifecycle: this.lifecycleManager,
      globalMiddlewares: middlewares,
    });

    await this.runRuntimeInitializers(path, controllers, hono, runtimeInitializers, get);

    for (const child of children) {
      const childMiddlewares = [...middlewares, ...(child.middlewares ?? [])];
      const childErrorHandlers = [...(child.errorHandlers ?? []), ...errorHandlerClasses];
      const childPath = joinPath(path, child.path);
      const childHono = await this.buildHonoInstance(
        childPath,
        child.controllers ?? [],
        childMiddlewares,
        childErrorHandlers,
        child.children ?? [],
        child.runtimeInitializers ?? [],
        fallbackHandler,
        resolver,
        Hono,
        get,
      );
      hono.route(child.path, childHono);
    }

    return hono;
  }
}
