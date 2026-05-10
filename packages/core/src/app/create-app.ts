import type { Hono } from 'hono';

import { createContainer } from '../internal/container';
import { LifecycleManager } from '../lifecycle';
import type { SchedulerRunner } from '../scheduler/runner';
import type { CommandClass } from '../command/types';

import { httpReady, createFetch, createRequest } from './http';
import { validateCommands, createHasCommand, createGetCommands } from './command';
import { schedulerReady } from './scheduler';
import {
  configReady,
  applyOverrides,
  configHasToken,
  createReplaceConfig,
  type AnyConfigClass,
  type AnyConstructorClass,
  type Resolver,
} from './config';
import type {
  App,
  CreateAppOptions,
  ReadyOptions,
  ReadyResult,
  ControllerClass,
} from './types';

type BuiltApp = {
  readonly hono: Hono | undefined;
  readonly lifecycle: LifecycleManager;
  readonly schedulerRunner: SchedulerRunner | undefined;
  readonly resolver: Resolver;
  readonly controllers: readonly ControllerClass[];
  readonly commandMap: ReadonlyMap<string, CommandClass>;
};

type BuildAppOptions = {
  readonly appOptions: CreateAppOptions;
  readonly configOverrides: ReadonlyMap<AnyConstructorClass, AnyConstructorClass>;
  readonly warmup: boolean;
  readonly commandMap: ReadonlyMap<string, CommandClass>;
};

type LifecycleResult = { ok: true } | { ok: false; cleanup: () => Promise<void> };

const lifecycleReady = async (lifecycle: LifecycleManager): Promise<LifecycleResult> =>
  lifecycle
    .startupPending()
    .then((): LifecycleResult => ({ ok: true }))
    .catch((): LifecycleResult => ({ ok: false, cleanup: () => lifecycle.shutdown() }));

const buildApp = async (options: BuildAppOptions): Promise<BuiltApp> => {
  const { appOptions, configOverrides, warmup, commandMap } = options;

  const effectiveConfigs = applyOverrides(appOptions.configs ?? [], configOverrides);
  const resolver = createContainer({ configs: effectiveConfigs });
  const lifecycle = resolver.get(LifecycleManager);

  configReady({ configs: effectiveConfigs, resolver });
  schedulerReady({ schedulers: appOptions.schedulers, resolver, lifecycle });

  const lifecycleResult = await lifecycleReady(lifecycle);
  if (!lifecycleResult.ok) {
    await lifecycleResult.cleanup();
    throw new Error('Lifecycle startup failed');
  }

  const hono = appOptions.http
    ? await httpReady({ httpOptions: appOptions.http, resolver, lifecycle, warmup })
    : undefined;

  return {
    hono,
    lifecycle,
    schedulerRunner: undefined,
    resolver,
    controllers: appOptions.http?.controllers ?? [],
    commandMap,
  };
};

const awaitSafe = async (p: Promise<unknown>): Promise<void> => {
  await p.catch(() => {});
};

type AppState = {
  built: BuiltApp | undefined;
  disposed: boolean;
  readyPromise: Promise<ReadyResult> | undefined;
  readonly configOverrides: Map<AnyConfigClass, AnyConfigClass>;
  readonly commandMap: ReadonlyMap<string, CommandClass>;
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
    state.readyPromise = buildApp({
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

const createBaseApp = (options: CreateAppOptions, state: AppState) => ({
  shutdown: createShutdown(state),
  ready: createReady(options, state),
  hasConfig: (token: AnyConfigClass): boolean => configHasToken(options.configs ?? [], token),
  replaceConfig: createReplaceConfig(options, state),
});

const buildAppObject = (options: CreateAppOptions, state: AppState): App<CreateAppOptions> => {
  const fetch = createFetch(() => state.built?.hono);
  const baseApp = createBaseApp(options, state);
  const httpMethods = options.http ? { fetch, request: createRequest(fetch) } : {};
  const commandMethods = options.commands?.length
    ? { hasCommand: createHasCommand(state.commandMap), getCommands: createGetCommands(state.commandMap) }
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
