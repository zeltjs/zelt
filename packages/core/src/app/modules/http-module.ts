import { Hono } from 'hono';
import { match, P } from 'ts-pattern';
import type { ResolverHandle } from '../../di/container';
import {
  ZeltContextNotAvailableError,
  ZeltDecoratorUsageError,
  ZeltLifecycleStateError,
} from '../../errors';
import { DefaultErrorHandler } from '../../http/default.error-handler';
import { buildRoutes, warmupControllers } from '../../http/internal/route-builder';
import type {
  ErrorHandlerClass,
  ErrorHandlerInstance,
  MiddlewareInput,
  RequestContext,
} from '../../http/middleware/types';
import type { LifecycleManager } from '../../lifecycle';
import type { Module, ReadyContext } from '../module';

export type ControllerClass = new (...args: never[]) => object;

export type HttpOptions = {
  readonly controllers: readonly ControllerClass[];
  readonly middlewares?: readonly MiddlewareInput[];
  readonly errorHandlers?: readonly ErrorHandlerClass[];
};

export type HttpModule = Module & {
  fetch: (req: Request) => Promise<Response>;
  request: (input: string | Request, init?: RequestInit) => Promise<Response>;
  getControllers: () => readonly ControllerClass[];
};

type HttpModuleState = {
  hono: Hono | undefined;
  isReady: boolean;
  isDisposed: boolean;
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

/** @throws {ZeltLifecycleStateError} */
const resolveErrorHandler = (
  cls: ErrorHandlerClass,
  resolver: ResolverHandle,
): ErrorHandlerInstance => {
  const instance: ErrorHandlerInstance = resolver.get(cls);
  return instance;
};

/** @throws {ZeltLifecycleStateError} */
const resolveErrorHandlers = (
  classes: readonly ErrorHandlerClass[],
  resolver: ResolverHandle,
): ErrorHandlerInstance[] => classes.map((cls) => resolveErrorHandler(cls, resolver));

/** @throws {ZeltContextNotAvailableError | ZeltDecoratorUsageError | ZeltLifecycleStateError} */
const setupHono = (
  httpOptions: HttpOptions,
  resolver: ResolverHandle,
  lifecycle: LifecycleManager,
): Hono => {
  const hono = new Hono({ strict: false });
  const errorHandlers = resolveErrorHandlers(httpOptions.errorHandlers ?? [], resolver);
  const fallbackHandler = resolver.get(DefaultErrorHandler);
  hono.onError(createErrorHandler(errorHandlers, fallbackHandler));
  buildRoutes({
    hono,
    controllers: httpOptions.controllers,
    resolver,
    lifecycle,
    globalMiddlewares: httpOptions.middlewares ?? [],
  });
  return hono;
};

type HttpModuleError =
  | ZeltContextNotAvailableError
  | ZeltDecoratorUsageError
  | ZeltLifecycleStateError;
type HttpResult = { hono: Hono } | { error: HttpModuleError; cleanup: () => Promise<void> };

/** @throws {HttpModuleError} */
const initializeHttpSetup = (
  httpOptions: HttpOptions,
  resolver: ResolverHandle,
  lifecycle: LifecycleManager,
): HttpResult => {
  try {
    return { hono: setupHono(httpOptions, resolver, lifecycle) };
  } catch (e) {
    if (e instanceof ZeltContextNotAvailableError) {
      return { error: e, cleanup: () => lifecycle.shutdown() };
    }
    if (e instanceof ZeltDecoratorUsageError) {
      return { error: e, cleanup: () => lifecycle.shutdown() };
    }
    if (e instanceof ZeltLifecycleStateError) {
      return { error: e, cleanup: () => lifecycle.shutdown() };
    }
    throw e;
  }
};

/** @throws {HttpModuleError} */
const initializeHttpWarmup = async (
  httpOptions: HttpOptions,
  resolver: ResolverHandle,
  lifecycle: LifecycleManager,
): Promise<HttpResult> => {
  try {
    await warmupControllers(httpOptions.controllers, resolver, lifecycle);
    return { hono: setupHono(httpOptions, resolver, lifecycle) };
  } catch (e) {
    if (e instanceof ZeltContextNotAvailableError) {
      return { error: e, cleanup: () => lifecycle.shutdown() };
    }
    if (e instanceof ZeltDecoratorUsageError) {
      return { error: e, cleanup: () => lifecycle.shutdown() };
    }
    if (e instanceof ZeltLifecycleStateError) {
      return { error: e, cleanup: () => lifecycle.shutdown() };
    }
    throw e;
  }
};

/** @throws {HttpModuleError} */
const handleHttpSetupResult = async (result: HttpResult): Promise<Hono> =>
  match(result)
    .with({ hono: P.select() }, (hono) => hono)
    .with({ error: P._, cleanup: P._ }, async (r) => {
      await r.cleanup();
      throw r.error;
    })
    .exhaustive();

/** @throws {HttpModuleError} */
const handleHttpWarmupResult = async (result: HttpResult): Promise<void> =>
  match(result)
    .with({ hono: P._ }, () => undefined)
    .with({ error: P._, cleanup: P._ }, async (r) => {
      await r.cleanup();
      throw r.error;
    })
    .exhaustive();

/** @throws {HttpModuleError} */
const initializeHttp = async (
  httpOptions: HttpOptions,
  resolver: ResolverHandle,
  lifecycle: LifecycleManager,
  warmup: boolean,
): Promise<Hono> => {
  const setupResult = initializeHttpSetup(httpOptions, resolver, lifecycle);
  const hono = await handleHttpSetupResult(setupResult);

  if (warmup) {
    const warmupResult = await initializeHttpWarmup(httpOptions, resolver, lifecycle);
    await handleHttpWarmupResult(warmupResult);
  }

  return hono;
};

const createRequest =
  (fetchFn: (req: Request) => Promise<Response>) =>
  (input: string | Request, init?: RequestInit): Promise<Response> => {
    const req =
      typeof input === 'string' ? new Request(new URL(input, 'http://localhost'), init) : input;
    return fetchFn(req);
  };

export const createHttpModule = (options: HttpOptions): HttpModule => {
  const state: HttpModuleState = {
    hono: undefined,
    isReady: false,
    isDisposed: false,
  };

  const setup = (): void => {
    // http module has no sync setup logic
  };

  /** @throws {HttpModuleError} */
  const ready = async (context: ReadyContext): Promise<void> => {
    state.hono = await initializeHttp(options, context.resolver, context.lifecycle, context.warmup);
    state.isReady = true;
  };

  const shutdown = async (): Promise<void> => {
    state.isDisposed = true;
  };

  /** @throws {ZeltLifecycleStateError} */
  const fetch = async (req: Request): Promise<Response> => {
    if (!state.hono) {
      throw new ZeltLifecycleStateError({ operation: 'fetch', currentState: 'not_ready' });
    }
    return state.hono.fetch(req);
  };

  const request = createRequest(fetch);

  const getControllers = (): readonly ControllerClass[] => options.controllers;

  return {
    setup,
    ready,
    shutdown,
    fetch,
    request,
    getControllers,
  };
};
