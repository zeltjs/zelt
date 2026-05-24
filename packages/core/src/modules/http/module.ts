import { Container, InjectionToken, injectable } from '@needle-di/core';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import { getConfig } from '../../built-in-service/config';
import { CorsConfig } from '../../built-in-service/http-security/cors.config';
import { SecureHeadersConfig } from '../../built-in-service/http-security/secure-headers.config';
import { inject } from '../../kernel/di/inject';
import { resolve } from '../../kernel/di/resolve';
import {
  ZeltContextNotAvailableError,
  ZeltDecoratorUsageError,
  ZeltLifecycleStateError,
} from '../../kernel/errors';
import type { Lifecycle } from '../../kernel/lifecycle';
import { LifecycleManager } from '../../kernel/lifecycle';
import type { Module } from '../module';
import { DefaultErrorHandler } from './error/default.error-handler';
import type {
  ErrorHandlerClass,
  ErrorHandlerInstance,
  MiddlewareInput,
  RequestContext,
} from './middleware/types';
import type { ControllerRouteInfo } from './routing/metadata';
import { collectControllerRouteInfo } from './routing/metadata';
import { buildRoutes, warmupControllers } from './routing/route-builder';

// --- Types ---

export type ControllerClass = new (...args: never[]) => object;

export type HttpOptions = {
  readonly controllers: readonly ControllerClass[];
  readonly middlewares?: readonly MiddlewareInput[];
  readonly errorHandlers?: readonly ErrorHandlerClass[];
};

export type HttpMetadata = {
  readonly controllers: readonly ControllerRouteInfo[];
};

export type HttpCapabilities = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
  readonly getControllers: () => readonly ControllerClass[];
  readonly getMetadata: () => HttpMetadata;
};

// --- Token ---

export const HTTP_OPTIONS = new InjectionToken<HttpOptions>('HTTP_OPTIONS');

// --- Runtime ---

const createErrorHandler =
  (errorHandlers: readonly ErrorHandlerInstance[], fallback: ErrorHandlerInstance) =>
  async (err: Error, c: RequestContext): Promise<Response> => {
    for (const handler of errorHandlers) {
      const result = await handler.onError(err, c);
      if (result) return result;
    }
    const fallbackResult = await fallback.onError(err, c);
    return (
      fallbackResult ??
      Response.json({ code: 'INTERNAL_ERROR', message: 'internal server error' }, { status: 500 })
    );
  };

const resolveErrorHandler = (
  cls: ErrorHandlerClass,
  container: Container,
): ErrorHandlerInstance => {
  const instance: ErrorHandlerInstance = resolve(container, cls);
  return instance;
};

const resolveErrorHandlers = (
  classes: readonly ErrorHandlerClass[],
  container: Container,
): ErrorHandlerInstance[] => classes.map((cls) => resolveErrorHandler(cls, container));

@injectable()
export class HttpRuntime implements Lifecycle {
  private hono: Hono | undefined;

  /** @throws {ZeltNotImplementedError} */
  constructor(
    private readonly options: HttpOptions = inject(HTTP_OPTIONS),
    private readonly container: Container = inject(Container),
    private readonly lifecycleManager: LifecycleManager = inject(LifecycleManager),
  ) {
    this.lifecycleManager.register(this);
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

  async startup(): Promise<void> {
    this.hono = await this.initializeHono();
  }

  async shutdown(): Promise<void> {
    this.hono = undefined;
  }

  /** @throws {ZeltNotImplementedError | ZeltContextNotAvailableError | ZeltDecoratorUsageError | ZeltLifecycleStateError} */
  private async initializeHono(): Promise<Hono> {
    try {
      const hono = new Hono({ strict: false });

      this.applySecurityMiddlewares(hono);

      const errorHandlers = resolveErrorHandlers(this.options.errorHandlers ?? [], this.container);
      const fallbackHandler = resolve(this.container, DefaultErrorHandler);
      hono.onError(createErrorHandler(errorHandlers, fallbackHandler));
      buildRoutes({
        hono,
        controllers: this.options.controllers,
        resolver: {
          get: <T extends object>(cls: new (...args: never[]) => T): T =>
            resolve(this.container, cls),
        },
        lifecycle: this.lifecycleManager,
        globalMiddlewares: this.options.middlewares ?? [],
      });
      return hono;
    } catch (e) {
      if (
        e instanceof ZeltContextNotAvailableError ||
        e instanceof ZeltDecoratorUsageError ||
        e instanceof ZeltLifecycleStateError
      ) {
        throw e;
      }
      throw e;
    }
  }

  /** @throws {ZeltLifecycleStateError} */
  async fetch(req: Request): Promise<Response> {
    if (!this.hono) {
      throw new ZeltLifecycleStateError({ operation: 'fetch', currentState: 'not_ready' });
    }
    return this.hono.fetch(req);
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

  private applySecurityMiddlewares(hono: Hono): void {
    const corsConfig = getConfig(this.container, CorsConfig);
    const secureHeadersConfig = getConfig(this.container, SecureHeadersConfig);

    const corsOrigin = corsConfig.origin;
    const hasCorsOrigin = Array.isArray(corsOrigin) ? corsOrigin.length > 0 : corsOrigin !== '';
    if (hasCorsOrigin) {
      const maxAge = corsConfig.maxAge;
      hono.use(
        cors({
          origin: corsConfig.origin,
          allowMethods: corsConfig.allowMethods,
          allowHeaders: corsConfig.allowHeaders,
          exposeHeaders: corsConfig.exposeHeaders,
          ...(maxAge !== undefined && { maxAge }),
          credentials: corsConfig.credentials,
        }),
      );
    }

    hono.use(
      secureHeaders({
        crossOriginEmbedderPolicy: secureHeadersConfig.crossOriginEmbedderPolicy,
        crossOriginResourcePolicy: secureHeadersConfig.crossOriginResourcePolicy,
        crossOriginOpenerPolicy: secureHeadersConfig.crossOriginOpenerPolicy,
        originAgentCluster: secureHeadersConfig.originAgentCluster,
        referrerPolicy: secureHeadersConfig.referrerPolicy,
        strictTransportSecurity: secureHeadersConfig.strictTransportSecurity,
        xContentTypeOptions: secureHeadersConfig.xContentTypeOptions,
        xDnsPrefetchControl: secureHeadersConfig.xDnsPrefetchControl,
        xDownloadOptions: secureHeadersConfig.xDownloadOptions,
        xFrameOptions: secureHeadersConfig.xFrameOptions,
        xPermittedCrossDomainPolicies: secureHeadersConfig.xPermittedCrossDomainPolicies,
        xXssProtection: secureHeadersConfig.xXssProtection,
        removePoweredBy: secureHeadersConfig.removePoweredBy,
      }),
    );
  }
}

// --- Module descriptor ---

export const HttpModule: Module<'http', HttpOptions, HttpCapabilities> = {
  key: 'http',
  bind: (container, config) => {
    container.bind({ provide: HTTP_OPTIONS, useValue: config });
  },
  resolve: (container) => {
    const runtime = container.get(HttpRuntime);
    return {
      fetch: (req) => runtime.fetch(req),
      request: (input, init) => runtime.request(input, init),
      getControllers: () => runtime.getControllers(),
      getMetadata: () => runtime.getMetadata(),
    };
  },
};
