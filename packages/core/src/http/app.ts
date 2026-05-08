import { Hono } from 'hono';

import { createContainer } from '../internal/container';
import { LifecycleManager } from '../lifecycle';
import { buildRoutes, warmupControllers } from '../internal/route-builder';
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

export type ReadyOptions = {
  readonly warmup?: boolean;
};

export type ReadyResult = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => T;
};

export type HttpApp = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
  readonly shutdown: () => Promise<void>;
  readonly ready: (options?: ReadyOptions) => Promise<ReadyResult>;
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

const setupHono = (
  options: CreateHttpAppOptions,
  resolver: Resolver,
  lifecycle: LifecycleManager,
): Hono => {
  const hono = new Hono({ strict: false });
  const errorHandlers = resolveErrorHandlers(options.errorHandlers ?? [], resolver);
  hono.onError(createErrorHandler(errorHandlers));
  buildRoutes({
    hono,
    controllers: options.controllers,
    resolver,
    lifecycle,
    globalMiddlewares: options.middlewares ?? [],
  });
  return hono;
};

type BuiltApp = {
  readonly hono: Hono;
  readonly lifecycle: LifecycleManager;
  readonly schedulerRunner: SchedulerRunner | undefined;
  readonly resolver: Resolver;
  readonly controllers: readonly ControllerClass[];
};

type BuildAppOptions = {
  readonly appOptions: CreateHttpAppOptions;
  readonly configOverrides: ReadonlyMap<AnyConstructorClass, AnyConstructorClass>;
  readonly warmup: boolean;
};

const buildApp = async (buildOptions: BuildAppOptions): Promise<BuiltApp> => {
  const { appOptions, configOverrides, warmup } = buildOptions;
  const effectiveConfigs = applyOverrides(appOptions.configs ?? [], configOverrides);
  const resolver = createContainer({ configs: effectiveConfigs });
  const lifecycle = resolver.get(LifecycleManager);

  instantiateConfigs(effectiveConfigs, resolver);
  const schedulerRunner = registerScheduler(appOptions.schedulers, resolver, lifecycle);

  try {
    await lifecycle.startupPending();
  } catch (error) {
    await lifecycle.shutdown();
    throw error;
  }

  let hono: Hono;
  try {
    hono = setupHono(appOptions, resolver, lifecycle);
  } catch (error) {
    await lifecycle.shutdown();
    throw error;
  }

  if (warmup) {
    try {
      await warmupControllers(appOptions.controllers, resolver, lifecycle);
    } catch (error) {
      await lifecycle.shutdown();
      throw error;
    }
  }

  return { hono, lifecycle, schedulerRunner, resolver, controllers: appOptions.controllers };
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

const awaitSafe = async (p: Promise<unknown>): Promise<void> => {
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
  readyPromise: Promise<ReadyResult> | undefined;
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

const createReadyResult = (resolver: Resolver): ReadyResult => ({
  get: <T extends object>(cls: new (...args: never[]) => T): T => resolver.get(cls),
});

const createReady =
  (options: CreateHttpAppOptions, state: AppState) =>
  async (readyOptions?: ReadyOptions): Promise<ReadyResult> => {
    if (state.disposed) throw new Error('Cannot ready() after shutdown()');
    if (state.readyPromise) return state.readyPromise;

    const warmup = readyOptions?.warmup ?? false;
    state.readyPromise = buildApp({
      appOptions: options,
      configOverrides: state.configOverrides,
      warmup,
    }).then((b) => {
      state.built = b;
      return createReadyResult(b.resolver);
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
