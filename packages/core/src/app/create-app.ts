import { Hono } from 'hono';
import { match, P } from 'ts-pattern';

import { createContainer } from '../internal/container';
import { LifecycleManager } from '../lifecycle';
import { buildRoutes, warmupControllers } from '../internal/route-builder';
import type { ErrorHandlerClass, ErrorHandlerInstance, RequestContext } from '../middleware/types';
import { createSchedulerRunner, type SchedulerRunner } from '../scheduler/runner';
import type { ConfigClass } from '../config';
import { findRootConfigToken } from '../config/token';
import { handleError } from '../http/error-handler';
import { getCommandMetadata } from '../command/metadata';
import type { CommandClass } from '../command/types';

import type {
  App,
  CreateAppOptions,
  HttpOptions,
  ReadyOptions,
  ReadyResult,
  ControllerClass,
  SchedulerClass,
} from './types';

type AnyConfigClass = ConfigClass<object>;
type AnyConstructorClass = new (...args: never[]) => object;
type Resolver = { get: <T extends object>(cls: new (...args: never[]) => T) => T };

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
  httpOptions: HttpOptions,
  resolver: Resolver,
  lifecycle: LifecycleManager,
): Hono => {
  const hono = new Hono({ strict: false });
  const errorHandlers = resolveErrorHandlers(httpOptions.errorHandlers ?? [], resolver);
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

const validateCommands = (commands: readonly CommandClass[]): Map<string, CommandClass> => {
  const commandMap = new Map<string, CommandClass>();
  for (const cls of commands) {
    const meta = getCommandMetadata(cls);
    if (!meta) {
      throw new Error(`Command class ${cls.name} is missing @Command decorator`);
    }
    if (commandMap.has(meta.name)) {
      throw new Error(`Duplicate command name: ${meta.name}`);
    }
    commandMap.set(meta.name, cls);
  }
  return commandMap;
};

type BuiltApp = {
  readonly hono: Hono | undefined;
  readonly lifecycle: LifecycleManager;
  readonly schedulerRunner: SchedulerRunner | undefined;
  readonly resolver: Resolver;
  readonly controllers: readonly ControllerClass[];
  readonly commandMap: ReadonlyMap<string, CommandClass>;
};

type BuildAppInternalOptions = {
  readonly appOptions: CreateAppOptions;
  readonly configOverrides: ReadonlyMap<AnyConstructorClass, AnyConstructorClass>;
  readonly warmup: boolean;
  readonly commandMap: ReadonlyMap<string, CommandClass>;
};

const applyOverrides = (
  configs: readonly AnyConstructorClass[],
  overrides: ReadonlyMap<AnyConstructorClass, AnyConstructorClass>,
): readonly AnyConstructorClass[] => {
  if (overrides.size === 0) return configs;
  return configs.map((cfg) => overrides.get(cfg) ?? cfg);
};

type LifecycleResult = { ok: true } | { ok: false; cleanup: () => Promise<void> };
type HttpResult = { hono: Hono } | { error: Error; cleanup: () => Promise<void> };

const initializeLifecycle = async (lifecycle: LifecycleManager): Promise<LifecycleResult> =>
  lifecycle
    .startupPending()
    .then((): LifecycleResult => ({ ok: true }))
    .catch((): LifecycleResult => ({ ok: false, cleanup: () => lifecycle.shutdown() }));

const toHttpError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

const initializeHttpSetup = (
  httpOptions: HttpOptions,
  resolver: Resolver,
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
  resolver: Resolver,
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
  resolver: Resolver,
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

const buildAppInternal = async (buildOptions: BuildAppInternalOptions): Promise<BuiltApp> => {
  const { appOptions, configOverrides, warmup, commandMap } = buildOptions;
  const effectiveConfigs = applyOverrides(appOptions.configs ?? [], configOverrides);
  const resolver = createContainer({ configs: effectiveConfigs });
  const lifecycle = resolver.get(LifecycleManager);

  instantiateConfigs(effectiveConfigs, resolver);
  const schedulerRunner = registerScheduler(appOptions.schedulers, resolver, lifecycle);

  const lifecycleResult = await initializeLifecycle(lifecycle);
  if (!lifecycleResult.ok) {
    await lifecycleResult.cleanup();
    throw new Error('Lifecycle startup failed');
  }

  const hono = appOptions.http
    ? await initializeHttp(appOptions.http, resolver, lifecycle, warmup)
    : undefined;

  return {
    hono,
    lifecycle,
    schedulerRunner,
    resolver,
    controllers: appOptions.http?.controllers ?? [],
    commandMap,
  };
};

const assertConfigToken = (
  tokenClass: AnyConfigClass,
  configs: readonly AnyConstructorClass[],
): void => {
  const targetRoot = findRootConfigToken(tokenClass);
  const hasToken = configs.some(
    (cfg) => cfg === tokenClass || findRootConfigToken(cfg) === targetRoot,
  );
  if (!hasToken) {
    throw new Error(`Cannot replaceConfig(): token ${tokenClass.name} is not in configs`);
  }
};

const awaitSafe = async (p: Promise<unknown>): Promise<void> => {
  await p.catch(() => {});
};

const configHasToken = (
  configs: readonly AnyConstructorClass[],
  tokenClass: AnyConfigClass,
): boolean => {
  const targetRoot = findRootConfigToken(tokenClass);
  return configs.some((cfg) => cfg === tokenClass || findRootConfigToken(cfg) === targetRoot);
};

type AppState = {
  built: BuiltApp | undefined;
  disposed: boolean;
  readyPromise: Promise<ReadyResult> | undefined;
  readonly configOverrides: Map<AnyConfigClass, AnyConfigClass>;
  readonly commandMap: ReadonlyMap<string, CommandClass>;
};

const createReplaceConfig =
  (options: CreateAppOptions, state: AppState) =>
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
  (options: CreateAppOptions, state: AppState) =>
  async (readyOptions?: ReadyOptions): Promise<ReadyResult> => {
    if (state.disposed) throw new Error('Cannot ready() after shutdown()');
    if (state.readyPromise) return state.readyPromise;

    const warmup = readyOptions?.warmup ?? false;
    state.readyPromise = buildAppInternal({
      appOptions: options,
      configOverrides: state.configOverrides,
      warmup,
      commandMap: state.commandMap,
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
    if (!state.built?.hono) throw new Error('Cannot fetch() before ready() or without http option');
    return state.built.hono.fetch(req);
  };

const createHasCommand =
  (state: AppState) =>
  (name: string): boolean =>
    state.commandMap.has(name);

const createGetCommands = (state: AppState) => (): ReadonlyMap<string, CommandClass> =>
  state.commandMap;

const createRequest =
  (fetchFn: (req: Request) => Promise<Response>) =>
  (input: string | Request, init?: RequestInit): Promise<Response> => {
    const req =
      typeof input === 'string' ? new Request(new URL(input, 'http://localhost'), init) : input;
    return fetchFn(req);
  };

const createBaseApp = (options: CreateAppOptions, state: AppState) => ({
  shutdown: createShutdown(state),
  ready: createReady(options, state),
  hasConfig: (token: AnyConfigClass): boolean => configHasToken(options.configs ?? [], token),
  replaceConfig: createReplaceConfig(options, state),
});

const buildAppObject = (options: CreateAppOptions, state: AppState): App<CreateAppOptions> => {
  const fetch = createFetch(state);
  const baseApp = createBaseApp(options, state);
  const httpMethods = options.http ? { fetch, request: createRequest(fetch) } : {};
  const commandMethods = options.commands?.length
    ? { hasCommand: createHasCommand(state), getCommands: createGetCommands(state) }
    : {};

  return { ...baseApp, ...httpMethods, ...commandMethods };
};

export function createApp<TOptions extends CreateAppOptions>(options: TOptions): App<TOptions>;
export function createApp(options: CreateAppOptions): App<CreateAppOptions> {
  if (!options.http && !options.commands?.length) {
    throw new Error('createApp requires at least http or commands option');
  }

  const commandMap = options.commands ? validateCommands(options.commands) : new Map();

  const state: AppState = {
    built: undefined,
    disposed: false,
    readyPromise: undefined,
    configOverrides: new Map<AnyConfigClass, AnyConfigClass>(),
    commandMap,
  };

  return buildAppObject(options, state);
}
