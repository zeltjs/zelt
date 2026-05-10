import { Hono } from 'hono';
import { match, P } from 'ts-pattern';

import { LifecycleManager } from '../lifecycle';
import { buildRoutes, warmupControllers } from '../internal/route-builder';
import type { ErrorHandlerClass, ErrorHandlerInstance, RequestContext } from '../middleware/types';
import { DefaultErrorHandler } from '../http/default-error-handler';

import type { HttpOptions, ControllerClass } from './types';

type Resolver = { get: <T extends object>(cls: new (...args: never[]) => T) => T };

const createErrorHandler =
  (errorHandlers: readonly ErrorHandlerInstance[]) =>
  async (err: Error, c: RequestContext): Promise<Response> => {
    for (const handler of errorHandlers) {
      const result = await handler.onError(err, c);
      if (result) return result;
    }
    throw new Error('Unreachable: DefaultErrorHandler should always return a response');
  };

const resolveErrorHandler = (cls: ErrorHandlerClass, resolver: Resolver): ErrorHandlerInstance => {
  const instance: ErrorHandlerInstance = resolver.get(cls);
  return instance;
};

const resolveErrorHandlers = (
  classes: readonly ErrorHandlerClass[],
  resolver: Resolver,
): ErrorHandlerInstance[] => classes.map((cls) => resolveErrorHandler(cls, resolver));

type SetupHonoOptions = {
  readonly httpOptions: HttpOptions;
  readonly resolver: Resolver;
  readonly lifecycle: LifecycleManager;
};

const setupHono = (options: SetupHonoOptions): Hono => {
  const { httpOptions, resolver, lifecycle } = options;
  const hono = new Hono({ strict: false });
  const userHandlers = resolveErrorHandlers(httpOptions.errorHandlers ?? [], resolver);
  const defaultHandler = resolver.get(DefaultErrorHandler);
  const errorHandlers = [...userHandlers, defaultHandler];
  hono.onError(createErrorHandler(errorHandlers));
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

export type HttpReadyOptions = {
  readonly httpOptions: HttpOptions;
  readonly resolver: Resolver;
  readonly lifecycle: LifecycleManager;
  readonly warmup: boolean;
};

const initializeHttpSetup = (
  options: Omit<HttpReadyOptions, 'warmup'>,
): HttpResult =>
  match(
    (() => {
      try {
        return { hono: setupHono(options) };
      } catch (e) {
        return { error: toHttpError(e), cleanup: () => options.lifecycle.shutdown() };
      }
    })(),
  )
    .with({ hono: P._ }, (r) => r)
    .with({ error: P._ }, (r) => r)
    .exhaustive();

const initializeHttpWarmup = async (
  options: Omit<HttpReadyOptions, 'warmup'>,
): Promise<HttpResult> =>
  warmupControllers(options.httpOptions.controllers, options.resolver, options.lifecycle)
    .then((): HttpResult => ({ hono: setupHono(options) }))
    .catch(
      (e): HttpResult => ({ error: toHttpError(e), cleanup: () => options.lifecycle.shutdown() }),
    );

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

export const httpReady = async (options: HttpReadyOptions): Promise<Hono> => {
  const { warmup, ...setupOptions } = options;
  const setupResult = initializeHttpSetup(setupOptions);
  const hono = await handleHttpSetupResult(setupResult);

  if (warmup) {
    const warmupResult = await initializeHttpWarmup(setupOptions);
    await handleHttpWarmupResult(warmupResult);
  }

  return hono;
};

export const createFetch =
  (getHono: () => Hono | undefined) =>
  async (req: Request): Promise<Response> => {
    const hono = getHono();
    if (!hono) throw new Error('Cannot fetch() before ready() or without http option');
    return hono.fetch(req);
  };

export const createRequest =
  (fetchFn: (req: Request) => Promise<Response>) =>
  (input: string | Request, init?: RequestInit): Promise<Response> => {
    const req =
      typeof input === 'string' ? new Request(new URL(input, 'http://localhost'), init) : input;
    return fetchFn(req);
  };

export type { ControllerClass };
