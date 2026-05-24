import { Container, injectable } from '@needle-di/core';
import { Hono } from 'hono';

import { inject } from '../../kernel/di/inject';
import { resolve } from '../../kernel/di/resolve';
import {
  ZeltContextNotAvailableError,
  ZeltDecoratorUsageError,
  ZeltLifecycleStateError,
  ZeltNotImplementedError,
} from '../../kernel/errors';
import type { Lifecycle } from '../../kernel/lifecycle';
import { LifecycleManager } from '../../kernel/lifecycle';
import { DefaultErrorHandler } from '../../modules/http/default.error-handler';
import type { ControllerRouteInfo } from '../../modules/http/internal/metadata';
import { collectControllerRouteInfo } from '../../modules/http/internal/metadata';
import { buildRoutes, warmupControllers } from '../../modules/http/internal/route-builder';
import type {
  ErrorHandlerClass,
  ErrorHandlerInstance,
  MiddlewareInput,
  RequestContext,
} from '../../modules/http/middleware/types';
import { HTTP_OPTIONS } from '../tokens';

export type ControllerClass = new (...args: never[]) => object;

export type HttpOptions = {
  readonly controllers: readonly ControllerClass[];
  readonly middlewares?: readonly MiddlewareInput[];
  readonly errorHandlers?: readonly ErrorHandlerClass[];
};

export type HttpMetadata = {
  readonly controllers: readonly ControllerRouteInfo[];
};

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
export class HttpModule implements Lifecycle {
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
          getConfig: () => {
            throw new ZeltNotImplementedError({ className: 'HttpModule', methodName: 'getConfig' });
          },
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
      const errorHandlers = resolveErrorHandlers(this.options.errorHandlers ?? [], this.container);
      const fallbackHandler = resolve(this.container, DefaultErrorHandler);
      hono.onError(createErrorHandler(errorHandlers, fallbackHandler));
      buildRoutes({
        hono,
        controllers: this.options.controllers,
        resolver: {
          get: <T extends object>(cls: new (...args: never[]) => T): T =>
            resolve(this.container, cls),
          getConfig: () => {
            throw new ZeltNotImplementedError({ className: 'HttpModule', methodName: 'getConfig' });
          },
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
}
