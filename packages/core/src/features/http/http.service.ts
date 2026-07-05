import { Container } from '@needle-di/core';
import type { Hono } from 'hono';
import { LoggerService } from '../../built-in-service';
import { Injectable, inject, LifecycleManager, resolve, ZeltInternalError } from '../../kernel';
import { DefaultErrorHandler } from './error/default.error-handler';
import type { HttpOptions } from './http.types';
import { createBootstrapMiddleware, createRequestRootChecker } from './http-bootstrap.lib';
import { createRouterErrorHandler, resolveErrorHandlers } from './http-error-handlers.lib';
import {
  guardMiddleware,
  middlewareIdentity,
  oncePerRequest,
  resolveMiddleware,
} from './middleware';
import { CorsMiddleware } from './middleware/cors/cors.middleware';
import type {
  HonoMiddleware,
  MiddlewareInput,
  RequestContext,
} from './middleware/middleware.types';
import { SecureHeadersMiddleware } from './middleware/secure-headers/secure-headers.middleware';
import { createRequestInjectionMiddleware } from './request-injection.lib';
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
  readonly use: (handler: HonoMiddleware) => unknown;
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
    private readonly logger: LoggerService = inject(LoggerService),
  ) {}

  /** @throws {ZeltInternalError} */
  async createLocalRouter(options: HttpOptions): Promise<HttpRouter> {
    try {
      return await this.initializeHono(options);
    } catch (cause) {
      throw new ZeltInternalError({ reason: 'http_router_init_failed' }, cause);
    }
  }

  /** @throws {Error | ZeltNotImplementedError | ZeltContextNotAvailableError | ZeltDecoratorUsageError | ZeltLifecycleStateError | ZeltReadyFailedError | BadRequestException}
   * @throws {unknown} from http-error-handlers.lib.ts:createRouterErrorHandler
   */
  private async initializeHono(options: HttpOptions): Promise<HonoInstance> {
    const Hono = await this.loadHonoConstructor();
    const fallbackHandler = resolve(this.container, DefaultErrorHandler);
    const resolver = {
      get: <T extends object>(cls: new (...args: never[]) => T): T => resolve(this.container, cls),
    };

    const routerToken = Symbol('zelt:http-router');
    const hono = new Hono({ strict: false });
    hono.use(
      createBootstrapMiddleware(this.lifecycleManager, routerToken, (error) => {
        this.logger.error('After-response callback failed', { error });
      }),
    );
    // Request helpers (body() etc.) must work inside the security and user
    // middlewares below, so injection happens before they run.
    hono.use(createRequestInjectionMiddleware());

    const errorHandlers = resolveErrorHandlers(options.errorHandlers ?? [], this.container);
    const routerErrorHandler = createRouterErrorHandler(
      errorHandlers,
      fallbackHandler,
      createRequestRootChecker(routerToken),
    );
    hono.onError(routerErrorHandler);

    const securityMiddlewares: readonly MiddlewareInput[] = [
      CorsMiddleware,
      SecureHeadersMiddleware,
    ];
    for (const input of securityMiddlewares) {
      const identity = middlewareIdentity(input);
      hono.use(
        guardMiddleware(identity, oncePerRequest(identity, resolveMiddleware(input, resolver))),
      );
    }
    for (const input of options.middlewares ?? []) {
      hono.use(guardMiddleware(middlewareIdentity(input), resolveMiddleware(input, resolver)));
    }

    buildRoutes({
      hono,
      controllers: options.controllers ?? [],
      resolver,
      lifecycle: this.lifecycleManager,
    });

    return hono;
  }

  private async loadHonoConstructor(): Promise<HonoConstructor> {
    const honoModule = await import('hono');
    return honoModule.Hono;
  }
}
