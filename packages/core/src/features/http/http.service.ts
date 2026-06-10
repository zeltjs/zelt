import { Container } from '@needle-di/core';
import type { Hono } from 'hono';
import { Injectable, inject, LifecycleManager, resolve } from '../../kernel';
import { DefaultErrorHandler } from './error/default.error-handler';
import type { HttpMountContext, HttpOptions } from './http.types';
import { createErrorHandler, resolveErrorHandlers } from './http-error-handlers.lib';
import { CorsMiddleware } from './middleware/cors/cors.middleware';
import type { MiddlewareInput, RequestContext } from './middleware/middleware.types';
import { SecureHeadersMiddleware } from './middleware/secure-headers/secure-headers.middleware';
import { buildRoutes } from './routing';

export type { HttpChildOptions, HttpMetadata, HttpModuleOptions, HttpOptions } from './http.types';

export type HttpRouter = Hono;

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
export class HttpService {
  constructor(
    private readonly container: Container = inject(Container),
    private readonly lifecycleManager: LifecycleManager = inject(LifecycleManager),
  ) {}

  /** @throws {Error} */
  async createLocalRouter(
    options: HttpOptions,
    context: HttpMountContext = { middlewares: [], errorHandlers: [] },
  ): Promise<HttpRouter> {
    try {
      return await this.initializeHono(options, context);
    } catch (cause) {
      throw new Error('HttpService createLocalRouter failed', { cause });
    }
  }

  /** @throws {ZeltNotImplementedError | ZeltContextNotAvailableError | ZeltDecoratorUsageError | ZeltLifecycleStateError} */
  private async initializeHono(
    options: HttpOptions,
    context: HttpMountContext,
  ): Promise<HonoInstance> {
    const Hono = await this.loadHonoConstructor();
    const fallbackHandler = resolve(this.container, DefaultErrorHandler);
    const resolver = {
      get: <T extends object>(cls: new (...args: never[]) => T): T => resolve(this.container, cls),
    };

    const securityMiddlewares: readonly MiddlewareInput[] = [
      CorsMiddleware,
      SecureHeadersMiddleware,
    ];
    const middlewares = [
      ...securityMiddlewares,
      ...context.middlewares,
      ...(options.middlewares ?? []),
    ];
    const errorHandlerClasses = [...(options.errorHandlers ?? []), ...context.errorHandlers];
    const hono = new Hono({ strict: false });

    const errorHandlers = resolveErrorHandlers(errorHandlerClasses, this.container);
    hono.onError(createErrorHandler(errorHandlers, fallbackHandler));

    buildRoutes({
      hono,
      controllers: options.controllers ?? [],
      resolver,
      lifecycle: this.lifecycleManager,
      globalMiddlewares: middlewares,
    });

    return hono;
  }

  private async loadHonoConstructor(): Promise<HonoConstructor> {
    const honoModule = await import('hono');
    return honoModule.Hono;
  }
}
