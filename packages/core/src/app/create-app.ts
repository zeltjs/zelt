import type { CommandClass } from '../command/types';
import type { ConfigClass } from '../config';
import { createContainer } from '../di/container';
import { LifecycleManager } from '../lifecycle';

import type { Module, ReadyContext } from './module';
import type { CommandModule } from './modules/command-module';
import { createCommandModule } from './modules/command-module';
import type { ConfigModule } from './modules/config-module';
import { createConfigModule } from './modules/config-module';
import type { ControllerClass, HttpModule, HttpOptions } from './modules/http-module';
import { createHttpModule } from './modules/http-module';
import type { SchedulerClass } from './modules/scheduler-module';
import { createSchedulerModule } from './modules/scheduler-module';

// --- Types ---

export type CreateAppOptions = {
  readonly http?: HttpOptions;
  readonly commands?: readonly CommandClass[];
  readonly schedulers?: readonly SchedulerClass[];
  readonly configs?: readonly ConfigClass<object>[];
};

export type ReadyOptions = {
  readonly warmup?: boolean;
};

export type ReadyResult = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => T;
  readonly getConfig: <T extends object>(configClass: ConfigClass<T>) => T;
};

type BaseApp = {
  readonly ready: (options?: ReadyOptions) => Promise<ReadyResult>;
  readonly shutdown: () => Promise<void>;
  readonly addFallbackConfig: (config: ConfigClass<object>) => void;
  readonly overrideConfig: (config: ConfigClass<object>) => void;
};

type HttpCapabilities = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
  readonly getControllers: () => readonly ControllerClass[];
};

type CommandCapabilities = {
  readonly hasCommand: (name: string) => boolean;
  readonly getCommands: () => ReadonlyMap<string, CommandClass>;
};

export type App<TOptions extends CreateAppOptions = CreateAppOptions> = BaseApp &
  (TOptions['http'] extends HttpOptions ? HttpCapabilities : object) &
  (TOptions['commands'] extends readonly CommandClass[] ? CommandCapabilities : object);

export type HttpApp = App<{ http: HttpOptions }>;

export type CommandApp = App<{ commands: readonly CommandClass[] }>;

type AppState = {
  readyPromise: Promise<ReadyResult> | undefined;
  readyContext: ReadyContext | undefined;
  disposed: boolean;
};

const createReadyResult = (context: ReadyContext): ReadyResult => ({
  get: <T extends object>(cls: new (...args: never[]) => T): T => context.resolver.get(cls),
  getConfig: <T extends object>(configClass: ConfigClass<T>): T =>
    context.resolver.getConfig(configClass),
});

const awaitSafe = async (p: Promise<unknown>): Promise<void> => {
  await p.catch(() => {});
};

type AppModules = {
  configModule: ConfigModule;
  httpModule: HttpModule | undefined;
  commandModule: CommandModule | undefined;
  schedulerModule: Module | undefined;
  all: Module[];
};

const createHttpModuleIfNeeded = (options: CreateAppOptions): HttpModule | undefined =>
  options.http ? createHttpModule(options.http) : undefined;

const createCommandModuleIfNeeded = (options: CreateAppOptions): CommandModule | undefined =>
  options.commands?.length ? createCommandModule(options.commands) : undefined;

const createSchedulerModuleIfNeeded = (options: CreateAppOptions): Module | undefined =>
  options.schedulers?.length ? createSchedulerModule(options.schedulers) : undefined;

const collectAllModules = (
  configModule: ConfigModule,
  httpModule: HttpModule | undefined,
  commandModule: CommandModule | undefined,
  schedulerModule: Module | undefined,
): Module[] => {
  const modules: Module[] = [configModule];
  if (httpModule) modules.push(httpModule);
  if (commandModule) modules.push(commandModule);
  if (schedulerModule) modules.push(schedulerModule);
  return modules;
};

const createAppModules = (options: CreateAppOptions): AppModules => {
  const configModule = createConfigModule();
  const httpModule = createHttpModuleIfNeeded(options);
  const commandModule = createCommandModuleIfNeeded(options);
  const schedulerModule = createSchedulerModuleIfNeeded(options);
  const all = collectAllModules(configModule, httpModule, commandModule, schedulerModule);

  return { configModule, httpModule, commandModule, schedulerModule, all };
};

type ReadyDeps = {
  state: AppState;
  modules: Module[];
  configModule: ConfigModule;
  configs: readonly ConfigClass<object>[] | undefined;
};

const createReady =
  (deps: ReadyDeps) =>
  async (readyOptions?: ReadyOptions): Promise<ReadyResult> => {
    const { state, modules, configModule, configs } = deps;
    if (state.disposed) throw new Error('Cannot ready() after shutdown()');
    if (state.readyPromise) return state.readyPromise;

    const warmup = readyOptions?.warmup ?? false;

    state.readyPromise = (async (): Promise<ReadyResult> => {
      const resolver = createContainer({
        defaults: configModule.getDefaults(),
        configs: configs ?? [],
        overrides: configModule.getOverrides(),
      });
      const lifecycle = resolver.get(LifecycleManager);
      const context: ReadyContext = { resolver, lifecycle, warmup };
      state.readyContext = context;

      for (const m of modules) {
        await m.ready(context);
      }
      await lifecycle.startupPending();

      return createReadyResult(context);
    })();

    return state.readyPromise;
  };

type ShutdownDeps = {
  state: AppState;
  modules: Module[];
};

const createShutdown = (deps: ShutdownDeps) => async (): Promise<void> => {
  const { state, modules } = deps;
  if (state.disposed) return;
  state.disposed = true;
  if (state.readyPromise) await awaitSafe(state.readyPromise);
  if (state.readyContext) {
    await state.readyContext.lifecycle.shutdown();
  }
  for (const m of modules) {
    await m.shutdown();
  }
};

const buildAppObject = (
  appModules: AppModules,
  state: AppState,
  configs: readonly ConfigClass<object>[] | undefined,
): App<CreateAppOptions> => {
  const { configModule, httpModule, commandModule, all: modules } = appModules;

  const baseApp = {
    ready: createReady({ state, modules, configModule, configs }),
    shutdown: createShutdown({ state, modules }),
    addFallbackConfig: configModule.addFallbackConfig,
    overrideConfig: configModule.overrideConfig,
  };

  const httpMethods = httpModule
    ? {
        fetch: httpModule.fetch,
        request: httpModule.request,
        getControllers: httpModule.getControllers,
      }
    : {};
  const commandMethods = commandModule
    ? { hasCommand: commandModule.hasCommand, getCommands: commandModule.getCommands }
    : {};

  return { ...baseApp, ...httpMethods, ...commandMethods };
};

export function createApp<TOptions extends CreateAppOptions>(options: TOptions): App<TOptions>;
export function createApp(options: CreateAppOptions): App<CreateAppOptions> {
  if (!options.http && !options.commands?.length) {
    throw new Error('createApp requires at least http or commands option');
  }

  const appModules = createAppModules(options);
  const state: AppState = { readyPromise: undefined, readyContext: undefined, disposed: false };

  for (const m of appModules.all) {
    m.setup();
  }

  return buildAppObject(appModules, state, options.configs);
}
