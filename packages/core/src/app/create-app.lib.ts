import { Container } from '@needle-di/core';

import type { ConfigClass } from '../built-in-service/config';
import type { ConfiguredFeature, NamespacedCaps } from '../features/feature.types';
import type { CommandModule } from '../modules/command/command.module';
import type { HttpModule } from '../modules/http/http.module';
import type { Module, ModuleCapsAll, ModuleCapsMap } from '../modules/module.types';
import type { SchedulerModule } from '../modules/scheduler/scheduler.module';
import type { ReadyResult } from './app-runtime.lib';
import { AppRuntime } from './app-runtime.lib';
import { ConfigRegistry } from './config-registry.lib';
import type { DefaultModulesConfig } from './default-modules.lib';
import { bindDefaultModules, resolveDefaultModuleCaps } from './default-modules.lib';
import { attachContainer } from './override.lib';

// ─── New Feature-based API types ───

export type NewCreateAppOptions = {
  readonly configs?: readonly ConfigClass<object>[];
};

export type ReadyOptions = {
  readonly configs?: readonly ConfigClass<object>[];
  readonly fallbackConfigs?: readonly ConfigClass<object>[];
  readonly warmup?: boolean;
};

export type NewApp<F extends readonly ConfiguredFeature[] = readonly ConfiguredFeature[]> = {
  readonly ready: (options?: ReadyOptions) => Promise<ReadyApp<F>>;
};

export type ReadyApp<F extends readonly ConfiguredFeature[] = readonly ConfiguredFeature[]> = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
  readonly shutdown: () => Promise<void>;
} & NamespacedCaps<F>;

// ─── New API helpers ───

const bindFeatures = (container: Container, features: readonly ConfiguredFeature[]): void => {
  for (const feature of features) {
    feature.bind(container);
  }
};

const resolveNamespacedCaps = (
  container: Container,
  features: readonly ConfiguredFeature[],
): Record<string, object> => {
  const caps: Record<string, object> = {};
  for (const feature of features) {
    const resolved = feature.resolve(container);
    if (Object.keys(resolved).length > 0) {
      caps[feature.key] = resolved;
    }
  }
  return caps;
};

const registerConfigs = (
  configRegistry: ConfigRegistry,
  configs: readonly ConfigClass<object>[] | undefined,
  fallbackConfigs: readonly ConfigClass<object>[] | undefined,
): void => {
  for (const config of configs ?? []) {
    configRegistry.overrideConfig(config);
  }
  for (const config of fallbackConfigs ?? []) {
    configRegistry.addFallbackConfig(config);
  }
};

// ─── Legacy Module-based API types (to be removed in Task 5) ───

export type CreateAppOptions = DefaultModulesConfig & {
  readonly configs?: readonly ConfigClass<object>[];
};

type BaseApp = {
  readonly ready: (options?: { readonly warmup?: boolean }) => Promise<ReadyResult>;
  readonly shutdown: () => Promise<void>;
  readonly addFallbackConfig: (config: ConfigClass<object>) => void;
  readonly overrideConfig: (config: ConfigClass<object>) => void;
};

export type App<M extends readonly Module[] = []> = BaseApp & ModuleCapsAll<M>;

export type HttpApp = App<[HttpModule]>;

export type CommandApp = App<[CommandModule]>;

export type SchedulerApp = App<[SchedulerModule]>;

type AppFromOptions<TOptions extends CreateAppOptions> = BaseApp &
  ModuleCapsMap<typeof import('./default-modules.lib').DefaultModules, TOptions>;

export type { ReadyResult } from './app-runtime.lib';

// ─── Legacy helpers ───

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

// ─── createApp: Feature-based (new) ───

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export function createApp<const F extends readonly ConfiguredFeature[]>(
  features: [...F],
  options?: NewCreateAppOptions,
): NewApp<F>;

// ─── createApp: Module-based (legacy, to be removed in Task 5) ───

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export function createApp<TOptions extends CreateAppOptions>(
  options: TOptions,
): AppFromOptions<TOptions>;

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export function createApp(
  featuresOrOptions: ConfiguredFeature[] | CreateAppOptions,
  maybeOptions?: NewCreateAppOptions,
): NewApp | AppFromOptions<CreateAppOptions> {
  if (Array.isArray(featuresOrOptions)) {
    return createFeatureApp(featuresOrOptions, maybeOptions);
  }
  return createLegacyApp(featuresOrOptions);
}

const createFeatureApp = (
  features: readonly ConfiguredFeature[],
  options?: NewCreateAppOptions,
): NewApp => {
  const baseConfigs = options?.configs;

  return {
    ready: async (readyOptions?: ReadyOptions): Promise<ReadyApp> => {
      const container = new Container();

      bindFeatures(container, features);

      // Resolve caps before ready() so services register their lifecycles
      const caps = resolveNamespacedCaps(container, features);

      const runtime = container.get(AppRuntime);
      const configRegistry = container.get(ConfigRegistry);

      registerConfigs(configRegistry, baseConfigs, undefined);
      registerConfigs(configRegistry, readyOptions?.configs, readyOptions?.fallbackConfigs);

      const readyResult = await runtime.ready(
        readyOptions?.warmup !== undefined ? { warmup: readyOptions.warmup } : undefined,
      );

      const readyApp = {
        ...caps,
        get: readyResult.get,
        shutdown: () => runtime.shutdown(),
      } as ReadyApp;

      return attachContainer(readyApp, container);
    },
  };
};

const createLegacyApp = (options: CreateAppOptions): AppFromOptions<CreateAppOptions> => {
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
};
