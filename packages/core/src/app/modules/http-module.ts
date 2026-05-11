import { Hono } from 'hono';
import { match, P } from 'ts-pattern';

import { DefaultErrorHandler } from '../../http/default.error-handler';
import { buildRoutes, warmupControllers } from '../../http/internal/route-builder';
import type {
  ErrorHandlerClass,
  ErrorHandlerInstance,
  MiddlewareInput,
  RequestContext,
} from '../../http/middleware/types';
import type { ResolverHandle } from '../../di/container';
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

const resolveErrorHandler = (
  cls: ErrorHandlerClass,
  resolver: ResolverHandle,
): ErrorHandlerInstance => {
  const instance: ErrorHandlerInstance = resolver.get(cls);
  return instance;
};

const resolveErrorHandlers = (
  classes: readonly ErrorHandlerClass[],
  resolver: ResolverHandle,
): ErrorHandlerInstance[] => classes.map((cls) => resolveErrorHandler(cls, resolver));

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

type HttpResult = { hono: Hono } | { error: Error; cleanup: () => Promise<void> };

const toHttpError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

const initializeHttpSetup = (
  httpOptions: HttpOptions,
  resolver: ResolverHandle,
  lifecycle: LifecycleManager,
): HttpResult =>
  match(
    (() => {
      try {
        return { hono: setupHono(httpOptions, resolver, lifecycle) };
      } catch (e) {
        return { error: toHttpError(e), cleanup: () => lifecycle.shutdown() };
      }
    })(),
  )
    .with({ hono: P._ }, (r) => r)
    .with({ error: P._ }, (r) => r)
    .exhaustive();

const initializeHttpWarmup = async (
  httpOptions: HttpOptions,
  resolver: ResolverHandle,
  lifecycle: LifecycleManager,
): Promise<HttpResult> =>
  warmupControllers(httpOptions.controllers, resolver, lifecycle)
    .then((): HttpResult => ({ hono: setupHono(httpOptions, resolver, lifecycle) }))
    .catch((e): HttpResult => ({ error: toHttpError(e), cleanup: () => lifecycle.shutdown() }));

const handleHttpSetupResult = async (result: HttpResult): Promise<Hono> =>
  match(result)
    .with({ hono: P._ }, (r) => r.hono)
    .with({ error: P._ }, async (r) => {
      await r.cleanup();
      throw r.error;
    })
    .exhaustive();

const handleHttpWarmupResult = async (result: HttpResult): Promise<void> => {
  await match(result)
    .with({ hono: P._ }, () => Promise.resolve())
    .with({ error: P._ }, async (r) => {
      await r.cleanup();
      throw r.error;
    })
    .exhaustive();
};

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

  const ready = async (context: ReadyContext): Promise<void> => {
    state.hono = await initializeHttp(options, context.resolver, context.lifecycle, context.warmup);
    state.isReady = true;
  };

  const shutdown = async (): Promise<void> => {
    state.isDisposed = true;
  };

  const fetch = async (req: Request): Promise<Response> => {
    if (!state.hono) {
      throw new Error('Cannot fetch() before ready()');
    }
    return state.hono.fetch(req);
  };

  const request = createRequest(fetch);

  return {
    setup,
    ready,
    shutdown,
    fetch,
    request,
  };
};
