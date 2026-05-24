import { Container } from '@needle-di/core';

import type { ConfigClass } from '../built-in-service/config';
import { CorsConfig } from '../built-in-service/http-security/cors.config';
import { SecureHeadersConfig } from '../built-in-service/http-security/secure-headers.config';
import { ZeltAppConfigurationError } from '../kernel/errors';
import type { ModuleCapsMap } from '../modules/module';
import type { ReadyOptions, ReadyResult } from './app-runtime';
import { AppRuntime } from './app-runtime';
import { ConfigRegistry } from './config-registry';
import type { DefaultModules, DefaultModulesConfig } from './default-modules';
import { bindDefaultModules, resolveDefaultModuleCaps } from './default-modules';

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

export type App<TOptions extends CreateAppOptions = CreateAppOptions> = BaseApp &
  ModuleCapsMap<typeof DefaultModules, TOptions>;

export type HttpApp = App<{ http: NonNullable<CreateAppOptions['http']> }>;

export type CommandApp = App<{ commands: NonNullable<CreateAppOptions['commands']> }>;

export type SchedulerApp = App<{ schedulers: NonNullable<CreateAppOptions['schedulers']> }>;

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

/** @throws {ZeltAppConfigurationError | ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export function createApp<TOptions extends CreateAppOptions>(options: TOptions): App<TOptions>;
/** @throws {ZeltAppConfigurationError | ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export function createApp(options: CreateAppOptions): App<CreateAppOptions> {
  if (!options.http && !options.commands?.length) {
    throw new ZeltAppConfigurationError({ reason: 'no_http_or_commands' });
  }

  const container = new Container();
  bindDefaultModules(container, options);

  const runtime = container.get(AppRuntime);
  const configRegistry = container.get(ConfigRegistry);

  configRegistry.addFallbackConfig(CorsConfig);
  configRegistry.addFallbackConfig(SecureHeadersConfig);

  registerInitialConfigs(configRegistry, options.configs);

  return {
    ...buildBaseApp(runtime, configRegistry),
    ...resolveDefaultModuleCaps(container, options),
  };
}
