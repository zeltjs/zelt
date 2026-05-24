import { Container } from '@needle-di/core';
import type { ConfigClass } from '../built-in-service/config';
import { ZeltAppConfigurationError } from '../kernel/errors';
import type { ExecResult } from '../modules/command/exec-result';
import type { CommandClass } from '../modules/command/types';
import type { ReadyOptions, ReadyResult } from './app-runtime';
import { AppRuntime } from './app-runtime';
import { ConfigRegistry } from './config-registry';
import { CommandModule } from './modules/command-module';
import type { ControllerClass, HttpMetadata, HttpOptions } from './modules/http-module';
import { HttpModule } from './modules/http-module';
import type { SchedulerClass } from './modules/scheduler-module';
import { SchedulerModule } from './modules/scheduler-module';
import { COMMAND_OPTIONS, HTTP_OPTIONS, SCHEDULER_OPTIONS } from './tokens';

// --- Types ---

export type CreateAppOptions = {
  readonly http?: HttpOptions;
  readonly commands?: readonly CommandClass[];
  readonly schedulers?: readonly SchedulerClass[];
  readonly configs?: readonly ConfigClass<object>[];
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
  readonly getMetadata: () => HttpMetadata;
};

type CommandCapabilities = {
  readonly hasCommand: (name: string) => boolean;
  readonly getCommands: () => ReadonlyMap<string, CommandClass>;
  readonly execCommand: (argv: readonly string[]) => Promise<ExecResult>;
};

type SchedulerCapabilities = {
  readonly startScheduler: () => Promise<void>;
  readonly stopScheduler: () => Promise<void>;
};

export type App<TOptions extends CreateAppOptions = CreateAppOptions> = BaseApp &
  (TOptions['http'] extends HttpOptions ? HttpCapabilities : object) &
  (TOptions['commands'] extends readonly CommandClass[] ? CommandCapabilities : object) &
  (TOptions['schedulers'] extends readonly SchedulerClass[] ? SchedulerCapabilities : object);

export type HttpApp = App<{ http: HttpOptions }>;

export type CommandApp = App<{ commands: readonly CommandClass[] }>;

export type SchedulerApp = App<{ schedulers: readonly SchedulerClass[] }>;

export type { ReadyOptions, ReadyResult } from './app-runtime';

// --- Helpers ---

const registerInitialConfigs = (
  configRegistry: ConfigRegistry,
  configs: readonly ConfigClass<object>[] | undefined,
): void => {
  for (const config of configs ?? []) {
    configRegistry.overrideConfig(config);
  }
};

const bindHttp = (container: Container, http: HttpOptions | undefined): void => {
  if (http) {
    container.bind({ provide: HTTP_OPTIONS, useValue: http });
  }
};

const bindCommands = (
  container: Container,
  commands: readonly CommandClass[] | undefined,
): void => {
  if (commands?.length) {
    container.bind({ provide: COMMAND_OPTIONS, useValue: commands });
  }
};

const bindSchedulers = (
  container: Container,
  schedulers: readonly SchedulerClass[] | undefined,
): void => {
  if (schedulers?.length) {
    container.bind({ provide: SCHEDULER_OPTIONS, useValue: schedulers });
  }
};

const bindOptions = (container: Container, options: CreateAppOptions): void => {
  bindHttp(container, options.http);
  bindCommands(container, options.commands);
  bindSchedulers(container, options.schedulers);
};

const buildBaseApp = (runtime: AppRuntime, configRegistry: ConfigRegistry): BaseApp => ({
  ready: (opts) => runtime.ready(opts),
  shutdown: () => runtime.shutdown(),
  addFallbackConfig: (config) => {
    runtime.assertCanModifyConfig('addFallbackConfig');
    configRegistry.addFallbackConfig(config);
  },
  overrideConfig: (config) => {
    runtime.assertCanModifyConfig('overrideConfig');
    configRegistry.overrideConfig(config);
  },
});

const buildHttpMethods = (httpModule: HttpModule | undefined): Partial<HttpCapabilities> =>
  httpModule
    ? {
        fetch: (req: Request) => httpModule.fetch(req),
        request: (input: string | Request, init?: RequestInit) => httpModule.request(input, init),
        getControllers: () => httpModule.getControllers(),
        getMetadata: () => httpModule.getMetadata(),
      }
    : {};

const buildCommandMethods = (
  commandModule: CommandModule | undefined,
): Partial<CommandCapabilities> =>
  commandModule
    ? {
        hasCommand: (name: string) => commandModule.hasCommand(name),
        getCommands: () => commandModule.getCommands(),
        execCommand: (argv: readonly string[]) => commandModule.exec(argv),
      }
    : {};

const buildSchedulerMethods = (
  schedulerModule: SchedulerModule | undefined,
): Partial<SchedulerCapabilities> =>
  schedulerModule
    ? {
        startScheduler: () => schedulerModule.startScheduler(),
        stopScheduler: () => schedulerModule.stopScheduler(),
      }
    : {};

type ResolvedModules = {
  runtime: AppRuntime;
  configRegistry: ConfigRegistry;
  httpModule: HttpModule | undefined;
  commandModule: CommandModule | undefined;
  schedulerModule: SchedulerModule | undefined;
};

const resolveModules = (container: Container, options: CreateAppOptions): ResolvedModules => ({
  runtime: container.get(AppRuntime),
  configRegistry: container.get(ConfigRegistry),
  httpModule: options.http ? container.get(HttpModule) : undefined,
  commandModule: options.commands?.length ? container.get(CommandModule) : undefined,
  schedulerModule: options.schedulers?.length ? container.get(SchedulerModule) : undefined,
});

// --- Main ---

/** @throws {ZeltAppConfigurationError | ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export function createApp<TOptions extends CreateAppOptions>(options: TOptions): App<TOptions>;
/** @throws {ZeltAppConfigurationError | ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export function createApp(options: CreateAppOptions): App<CreateAppOptions> {
  if (!options.http && !options.commands?.length) {
    throw new ZeltAppConfigurationError({ reason: 'no_http_or_commands' });
  }

  const container = new Container();
  bindOptions(container, options);

  const { runtime, configRegistry, httpModule, commandModule, schedulerModule } = resolveModules(
    container,
    options,
  );

  registerInitialConfigs(configRegistry, options.configs);

  return {
    ...buildBaseApp(runtime, configRegistry),
    ...buildHttpMethods(httpModule),
    ...buildCommandMethods(commandModule),
    ...buildSchedulerMethods(schedulerModule),
  };
}
