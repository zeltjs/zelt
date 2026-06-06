import { Container, InjectionToken } from '@needle-di/core';
import type { Hono } from 'hono';
import type { Lifecycle } from '../../kernel';
import { LifecycleManager } from '../../kernel';
import { Injectable, inject, resolve } from '../../kernel';
import { DefaultErrorHandler } from './error/default.error-handler';
import type { ControllerClass, HttpChildOptions, HttpOptions } from './http.types';
import { collectAllControllerMetadata, collectAllControllers } from './http-children.lib';
import { createErrorHandler, resolveErrorHandlers } from './http-error-handlers.lib';
import { CorsMiddleware } from './middleware/cors/cors.middleware';
import type {
  ErrorHandlerClass,
  MiddlewareInput,
  RequestContext,
} from './middleware/middleware.types';
import { SecureHeadersMiddleware } from './middleware/secure-headers/secure-headers.middleware';
import type { ControllerRouteInfo } from './routing';
import { buildRoutes, warmupControllers } from './routing';

export type { HttpChildOptions, HttpOptions } from './http.types';

export type HttpMetadata = {
  readonly controllers: readonly ControllerRouteInfo[];
};

export const HTTP_OPTIONS = new InjectionToken<HttpOptions>('HTTP_OPTIONS');

type RouteHandler = (c: RequestContext) => Promise<Response>;

type HonoInstance = Hono;

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
export class HttpService implements Lifecycle<{ hono: HonoInstance }> {
  private readonly ready;

  /** @throws {ZeltNotImplementedError | ZeltLifecycleStateError} */
  constructor(
    private readonly options: HttpOptions = inject(HTTP_OPTIONS),
    private readonly container: Container = inject(Container),
    private readonly lifecycleManager: LifecycleManager = inject(LifecycleManager),
  ) {
    this.ready = this.lifecycleManager.register(this);
  }

  /** @throws {ZeltReadyFailedError | ZeltLifecycleStateError} */
  async warmupControllers(): Promise<void> {
    await warmupControllers(
      collectAllControllers(this.options),
      {
        get: <T extends object>(cls: new (...args: never[]) => T): T =>
          resolve(this.container, cls),
      },
      this.lifecycleManager,
    );
  }

  /** @throws {Error} */
  async startup(): Promise<{ hono: HonoInstance }> {
    try {
      return { hono: await this.initializeHono() };
    } catch (cause) {
      throw new Error('HttpService startup failed', { cause });
    }
  }

  /** @throws {ZeltNotImplementedError | ZeltContextNotAvailableError | ZeltDecoratorUsageError | ZeltLifecycleStateError} */
  private async initializeHono(): Promise<HonoInstance> {
    const Hono = await this.loadHonoConstructor();
    const fallbackHandler = resolve(this.container, DefaultErrorHandler);
    const resolver = {
      get: <T extends object>(cls: new (...args: never[]) => T): T => resolve(this.container, cls),
    };

    const securityMiddlewares: readonly MiddlewareInput[] = [
      CorsMiddleware,
      SecureHeadersMiddleware,
    ];
    const rootMiddlewares = [...securityMiddlewares, ...(this.options.middlewares ?? [])];

    const hono = this.buildHonoInstance(
      this.options.controllers,
      rootMiddlewares,
      this.options.errorHandlers ?? [],
      this.options.children ?? [],
      fallbackHandler,
      resolver,
      Hono,
    );
    return hono;
  }

  private async loadHonoConstructor(): Promise<HonoConstructor> {
    const honoModule = await import('hono');
    return honoModule.Hono;
  }

  /** @throws {ZeltContextNotAvailableError | ZeltDecoratorUsageError} */
  private buildHonoInstance(
    controllers: readonly ControllerClass[],
    middlewares: readonly MiddlewareInput[],
    errorHandlerClasses: readonly ErrorHandlerClass[],
    children: readonly HttpChildOptions[],
    fallbackHandler: InstanceType<typeof DefaultErrorHandler>,
    resolver: { get: <T extends object>(cls: new (...args: never[]) => T) => T },
    Hono: HonoConstructor,
  ): HonoInstance {
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

    for (const child of children) {
      const childMiddlewares = [...middlewares, ...(child.middlewares ?? [])];
      const childErrorHandlers = [...(child.errorHandlers ?? []), ...errorHandlerClasses];
      const childHono = this.buildHonoInstance(
        child.controllers ?? [],
        childMiddlewares,
        childErrorHandlers,
        child.children ?? [],
        fallbackHandler,
        resolver,
        Hono,
      );
      hono.route(child.path, childHono);
    }

    return hono;
  }

  async shutdown(): Promise<void> {}

  /** @throws {ZeltLifecycleStateError} */
  async fetch(req: Request): Promise<Response> {
    return this.ready.hono.fetch(req);
  }

  request(input: string | Request, init?: RequestInit): Promise<Response> {
    const req =
      typeof input === 'string' ? new Request(new URL(input, 'http://localhost'), init) : input;
    return this.fetch(req);
  }

  getControllers(): readonly ControllerClass[] {
    return collectAllControllers(this.options);
  }

  getMetadata(): HttpMetadata {
    return {
      controllers: collectAllControllerMetadata(this.options),
    };
  }
}
