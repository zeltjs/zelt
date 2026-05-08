import { Hono } from 'hono';

import { createContainer } from '../internal/container';
import { LifecycleManager } from '../lifecycle';
import { buildRoutes } from '../internal/route-builder';
import type {
  ErrorHandlerClass,
  ErrorHandlerInstance,
  MiddlewareInput,
  RequestContext,
} from '../middleware/types';
import { createSchedulerRunner, type SchedulerRunner } from '../scheduler/runner';
import type { ConfigClass } from '../config';
import { findConfigToken } from '../config';

import { handleError } from './error-handler';

type AnyConfigClass = ConfigClass<object>;
type AnyConstructorClass = new (...args: never[]) => object;

type ControllerClass = new (...args: never[]) => object;
type SchedulerClass = new (...args: never[]) => object;
type Resolver = { get: <T extends object>(cls: new (...args: never[]) => T) => T };

export type CreateHttpAppOptions = {
  readonly controllers: readonly ControllerClass[];
  readonly schedulers?: readonly SchedulerClass[];
  readonly middlewares?: readonly MiddlewareInput[];
  readonly errorHandlers?: readonly ErrorHandlerClass[];
  readonly configs?: readonly (new (...args: never[]) => object)[];
};

export type HttpApp = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
  readonly shutdown: () => Promise<void>;
  readonly ready: () => Promise<void>;
  readonly hasConfig: (token: AnyConfigClass) => boolean;
  readonly replaceConfig: (token: AnyConfigClass, replacement: AnyConfigClass) => void;
  /** @deprecated Scheduler now starts automatically. Use shutdown() to stop. */
  readonly startScheduler: () => void;
  /** @deprecated Scheduler now stops via shutdown(). */
  readonly stopScheduler: () => Promise<void>;
};

const createErrorHandler =
  (errorHandlers: readonly ErrorHandlerInstance[]) =>
  async (err: Error, c: RequestContext): Promise<Response> => {
    for (const handler of errorHandlers) {
      const result = await handler.onError(err, c);
      if (result) return result;
    }
    return handleError(err);
  };

const resolveErrorHandler = (cls: ErrorHandlerClass, resolver: Resolver): ErrorHandlerInstance => {
  const instance: ErrorHandlerInstance = resolver.get(cls);
  return instance;
};

const resolveErrorHandlers = (
  classes: readonly ErrorHandlerClass[],
  resolver: Resolver,
): ErrorHandlerInstance[] => classes.map((cls) => resolveErrorHandler(cls, resolver));

const instantiateConfigs = (
  configs: readonly AnyConstructorClass[] | undefined,
  resolver: Resolver,
): void => {
  for (const configClass of configs ?? []) {
    resolver.get(configClass);
  }
};

const registerScheduler = (
  schedulers: readonly SchedulerClass[] | undefined,
  resolver: Resolver,
  lifecycle: LifecycleManager,
): SchedulerRunner | undefined => {
  if (!schedulers || schedulers.length === 0) return undefined;
  const runner = createSchedulerRunner(schedulers, resolver);
  lifecycle.register(runner);
  return runner;
};

const setupHono = (options: CreateHttpAppOptions, resolver: Resolver): Hono => {
  // strict:false で `/echo` と `/echo/` を同一視する。joinPath が末尾スラッシュを正規化するため、
  // 利用者が `@Post('/')` と書いた場合でも `/echo/` リクエストにマッチさせる必要がある。
  const hono = new Hono({ strict: false });
  const errorHandlers = resolveErrorHandlers(options.errorHandlers ?? [], resolver);
  hono.onError(createErrorHandler(errorHandlers));
  buildRoutes(hono, options.controllers, resolver, options.middlewares ?? []);
  return hono;
};

type BuiltApp = {
  readonly hono: Hono;
  readonly lifecycle: LifecycleManager;
  readonly schedulerRunner: SchedulerRunner | undefined;
};

const buildApp = async (
  options: CreateHttpAppOptions,
  configOverrides: ReadonlyMap<AnyConstructorClass, AnyConstructorClass>,
): Promise<BuiltApp> => {
  const effectiveConfigs = applyOverrides(options.configs ?? [], configOverrides);
  const resolver = createContainer({ configs: effectiveConfigs });
  const lifecycle = resolver.get(LifecycleManager);

  instantiateConfigs(effectiveConfigs, resolver);
  const schedulerRunner = registerScheduler(options.schedulers, resolver, lifecycle);

  try {
    await lifecycle.startup();
  } catch (error) {
    await lifecycle.shutdown();
    throw error;
  }

  let hono: Hono;
  try {
    hono = setupHono(options, resolver);
  } catch (error) {
    await lifecycle.shutdown();
    throw error;
  }

  return { hono, lifecycle, schedulerRunner };
};

const applyOverrides = (
  configs: readonly AnyConstructorClass[],
  overrides: ReadonlyMap<AnyConstructorClass, AnyConstructorClass>,
): readonly AnyConstructorClass[] => {
  if (overrides.size === 0) return configs;
  return configs.map((cfg) => overrides.get(cfg) ?? cfg);
};

const assertConfigToken = (
  token: AnyConfigClass,
  configs: readonly AnyConstructorClass[],
): void => {
  const hasToken = configs.some((cfg) => cfg === token || findConfigToken(cfg) === token);
  if (!hasToken) {
    throw new Error(`Cannot replaceConfig(): token ${token.name} is not in configs`);
  }
};

const awaitSafe = async (p: Promise<void>): Promise<void> => {
  try {
    await p;
  } catch {
    // ignore: callers handle the error state independently
  }
};

const configHasToken = (configs: readonly AnyConstructorClass[], token: AnyConfigClass): boolean =>
  configs.some((cfg) => cfg === token || findConfigToken(cfg) === token);

type AppState = {
  built: BuiltApp | undefined;
  disposed: boolean;
  readyPromise: Promise<void> | undefined;
  readonly configOverrides: Map<AnyConfigClass, AnyConfigClass>;
};

const createReplaceConfig =
  (options: CreateHttpAppOptions, state: AppState) =>
  (token: AnyConfigClass, replacement: AnyConfigClass): void => {
    if (state.disposed) throw new Error('Cannot replaceConfig() after shutdown()');
    if (state.built) throw new Error('Cannot replaceConfig() after ready()');
    assertConfigToken(token, options.configs ?? []);
    state.configOverrides.set(token, replacement);
  };

const createReady = (options: CreateHttpAppOptions, state: AppState) => async (): Promise<void> => {
  if (state.disposed) throw new Error('Cannot ready() after shutdown()');
  if (state.built) return;
  if (state.readyPromise) return state.readyPromise;
  state.readyPromise = buildApp(options, state.configOverrides).then((b) => {
    state.built = b;
  });
  return state.readyPromise;
};

const createShutdown = (state: AppState) => async (): Promise<void> => {
  if (state.disposed) return;
  state.disposed = true;
  if (state.readyPromise) await awaitSafe(state.readyPromise);
  if (state.built) {
    await state.built.lifecycle.shutdown();
    state.built = undefined;
  }
};

const createFetch =
  (state: AppState) =>
  async (req: Request): Promise<Response> => {
    if (!state.built) throw new Error('Cannot fetch() before ready()');
    return state.built.hono.fetch(req);
  };

const createAppMethods = (options: CreateHttpAppOptions, state: AppState): HttpApp => {
  const fetch = createFetch(state);
  const request = (input: string | Request, init?: RequestInit): Promise<Response> => {
    const req =
      typeof input === 'string' ? new Request(new URL(input, 'http://localhost'), init) : input;
    return fetch(req);
  };

  return {
    fetch,
    request,
    shutdown: createShutdown(state),
    ready: createReady(options, state),
    hasConfig: (token: AnyConfigClass): boolean => configHasToken(options.configs ?? [], token),
    replaceConfig: createReplaceConfig(options, state),
    startScheduler: (): void => {},
    stopScheduler: async (): Promise<void> => {
      await state.built?.schedulerRunner?.shutdown();
    },
  };
};

export const createHttpApp = (options: CreateHttpAppOptions): HttpApp => {
  const state: AppState = {
    built: undefined,
    disposed: false,
    readyPromise: undefined,
    configOverrides: new Map<AnyConfigClass, AnyConfigClass>(),
  };
  return createAppMethods(options, state);
};
