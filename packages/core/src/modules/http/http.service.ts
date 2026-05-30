import { Container, InjectionToken } from '@needle-di/core';
import { Hono } from 'hono';
import type { Lifecycle } from '../../kernel';
import { LifecycleManager } from '../../kernel';
import { Injectable, inject, resolve } from '../../kernel/di';
import { DefaultErrorHandler } from './error/default.error-handler';
import type { ControllerClass, HttpChildOptions, HttpOptions } from './http.types';
import { collectAllControllerMetadata, collectAllControllers } from './http-children.lib';
import { createErrorHandler, resolveErrorHandlers } from './http-error-handlers.lib';
import { CorsMiddleware } from './middleware/cors/cors.middleware';
import type { ErrorHandlerClass, MiddlewareInput } from './middleware/middleware.types';
import { SecureHeadersMiddleware } from './middleware/secure-headers/secure-headers.middleware';
import type { ControllerRouteInfo } from './routing';
import { buildRoutes, warmupControllers } from './routing';

export type { HttpChildOptions, HttpOptions } from './http.types';

export type HttpMetadata = {
  readonly controllers: readonly ControllerRouteInfo[];
};

export const HTTP_OPTIONS = new InjectionToken<HttpOptions>('HTTP_OPTIONS');

@Injectable()
export class HttpService implements Lifecycle<{ hono: Hono }> {
  private readonly ready;

  /** @throws {ZeltNotImplementedError} */
  constructor(
    private readonly options: HttpOptions = inject(HTTP_OPTIONS),
    private readonly container: Container = inject(Container),
    private readonly lifecycleManager: LifecycleManager = inject(LifecycleManager),
  ) {
    this.ready = this.lifecycleManager.register(this);
    this.lifecycleManager.registerWarmup(async () => {
      await warmupControllers(
        collectAllControllers(this.options),
        {
          get: <T extends object>(cls: new (...args: never[]) => T): T =>
            resolve(this.container, cls),
        },
        this.lifecycleManager,
      );
    });
  }

  /** @throws {ZeltNotImplementedError} */
  async startup(): Promise<{ hono: Hono }> {
    return { hono: await this.initializeHono() };
  }

  /** @throws {ZeltNotImplementedError | ZeltContextNotAvailableError | ZeltDecoratorUsageError | ZeltLifecycleStateError} */
  private async initializeHono(): Promise<Hono> {
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
    );
    return hono;
  }

  /** @throws {ZeltContextNotAvailableError | ZeltDecoratorUsageError} */
  private buildHonoInstance(
    controllers: readonly ControllerClass[],
    middlewares: readonly MiddlewareInput[],
    errorHandlerClasses: readonly ErrorHandlerClass[],
    children: readonly HttpChildOptions[],
    fallbackHandler: InstanceType<typeof DefaultErrorHandler>,
    resolver: { get: <T extends object>(cls: new (...args: never[]) => T) => T },
  ): Hono {
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
