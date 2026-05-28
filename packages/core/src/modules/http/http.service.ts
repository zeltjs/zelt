import { Container, InjectionToken } from '@needle-di/core';
import { Hono } from 'hono';
import type { Lifecycle } from '../../kernel';
import { LifecycleManager } from '../../kernel';
import { Injectable, inject, resolve } from '../../kernel/di';
import { DefaultErrorHandler } from './error/default.error-handler';
import type { ControllerClass } from './http.types';
import { createErrorHandler, resolveErrorHandlers } from './http-error-handlers.lib';
import { CorsMiddleware } from './middleware/cors/cors.middleware';
import type { ErrorHandlerClass, MiddlewareInput } from './middleware/middleware.types';
import { SecureHeadersMiddleware } from './middleware/secure-headers/secure-headers.middleware';
import type { ControllerRouteInfo } from './routing';
import { buildRoutes, collectControllerRouteInfo, warmupControllers } from './routing';

export type HttpOptions = {
  readonly controllers: readonly ControllerClass[];
  readonly middlewares?: readonly MiddlewareInput[];
  readonly errorHandlers?: readonly ErrorHandlerClass[];
};

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
        this.options.controllers,
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
    const hono = new Hono({ strict: false });

    const errorHandlers = resolveErrorHandlers(this.options.errorHandlers ?? [], this.container);
    const fallbackHandler = resolve(this.container, DefaultErrorHandler);
    hono.onError(createErrorHandler(errorHandlers, fallbackHandler));

    const securityMiddlewares: readonly MiddlewareInput[] = [
      CorsMiddleware,
      SecureHeadersMiddleware,
    ];

    buildRoutes({
      hono,
      controllers: this.options.controllers,
      resolver: {
        get: <T extends object>(cls: new (...args: never[]) => T): T =>
          resolve(this.container, cls),
      },
      lifecycle: this.lifecycleManager,
      globalMiddlewares: [...securityMiddlewares, ...(this.options.middlewares ?? [])],
    });
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
    return this.options.controllers;
  }

  getMetadata(): HttpMetadata {
    return {
      controllers: this.options.controllers.map(collectControllerRouteInfo),
    };
  }
}
