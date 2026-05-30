import { Container } from '@needle-di/core';

import type { ConfigClass } from '../built-in-service/config';
import type { CommandModule } from '../modules/command/command.module';
import type { HttpModule } from '../modules/http/http.module';
import type { Module, ModuleCapsAll, ModuleCapsMap } from '../modules/module.types';
import type { SchedulerModule } from '../modules/scheduler/scheduler.module';
import type { ReadyOptions, ReadyResult } from './app-runtime.lib';
import { AppRuntime } from './app-runtime.lib';
import { ConfigRegistry } from './config-registry.lib';
import type { DefaultModules, DefaultModulesConfig } from './default-modules.lib';
import { bindDefaultModules, resolveDefaultModuleCaps } from './default-modules.lib';
import { attachContainer } from './override.lib';

// --- Types ---

export type CreateAppOptions = DefaultModulesConfig & {
  readonly configs?: readonly ConfigClass<object>[];
};

type BaseApp = {
  readonly ready: (options?: ReadyOptions) => Promise<ReadyResult>;
  readonly shutdown: () => Promise<void>;
  readonly addFallbackConfig: (config: ConfigClass<object>) => void;
  readonly overrideConfig: (config: ConfigClass<object>) => void;
};

export type App<M extends readonly Module[] = []> = BaseApp & ModuleCapsAll<M>;

export type HttpApp = App<[HttpModule]>;

export type CommandApp = App<[CommandModule]>;

export type SchedulerApp = App<[SchedulerModule]>;

type AppFromOptions<TOptions extends CreateAppOptions> = BaseApp &
  ModuleCapsMap<typeof DefaultModules, TOptions>;

export type { ReadyOptions, ReadyResult } from './app-runtime.lib';

// --- Helpers ---

const registerInitialConfigs = (
  configRegistry: ConfigRegistry,
  configs: readonly ConfigClass<object>[] | undefined,
): void => {
  for (const config of configs ?? []) {
    configRegistry.overrideConfig(config);
  }
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

// --- Main ---

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export function createApp<TOptions extends CreateAppOptions>(
  options: TOptions,
): AppFromOptions<TOptions>;
/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export function createApp(options: CreateAppOptions): AppFromOptions<CreateAppOptions> {
  const container = new Container();
  bindDefaultModules(container, options);

  const runtime = container.get(AppRuntime);
  const configRegistry = container.get(ConfigRegistry);

  registerInitialConfigs(configRegistry, options.configs);

  const baseApp = {
    ...buildBaseApp(runtime, configRegistry),
    ...resolveDefaultModuleCaps(container, options),
  };

  return attachContainer(baseApp, container);
}
