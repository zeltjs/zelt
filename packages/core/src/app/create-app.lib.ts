import { Container } from '@needle-di/core';
import { unsafeObjectFromKeyedValues } from '@zeltjs/unsafe-type-lib';

import type { ConfigClass } from '../built-in-service/config';
import type {
  ConfiguredFeature,
  FeatureRuntime,
  NamespacedCaps,
  StaticNamespacedCaps,
} from '../features/feature.types';
import { AppRuntime } from './app-runtime.lib';
import { ConfigRegistry } from './config-registry.lib';
import { attachContainer } from './override.lib';

export type CreateAppOptions = {
  readonly configs?: readonly ConfigClass<object>[];
};

export type ReadyOptions = {
  readonly configs?: readonly ConfigClass<object>[];
  readonly fallbackConfigs?: readonly ConfigClass<object>[];
  readonly warmup?: boolean;
};

export type App<F extends readonly ConfiguredFeature[]> = {
  readonly ready: (options?: ReadyOptions) => Promise<ReadyApp<F>>;
} & StaticNamespacedCaps<F>;

export type ReadyApp<F extends readonly ConfiguredFeature[]> = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
  readonly shutdown: () => Promise<void>;
} & NamespacedCaps<F>;

// ─── Helpers ───

const bindFeatures = (container: Container, features: readonly ConfiguredFeature[]): void => {
  for (const feature of features) {
    feature.bind(container);
  }
};

const createNamespacedCapabilities = async <const F extends readonly ConfiguredFeature[]>(
  runtime: FeatureRuntime,
  features: F,
): Promise<NamespacedCaps<F>> => {
  return unsafeObjectFromKeyedValues(features, 'createCapabilities', runtime);
};

const createStaticCapabilities = <const F extends readonly ConfiguredFeature[]>(
  features: F,
): StaticNamespacedCaps<F> => {
  const result: Record<PropertyKey, object> = {};
  for (const feature of features) {
    if ('staticCapabilities' in feature && typeof feature.staticCapabilities === 'function') {
      result[feature.key] = feature.staticCapabilities();
    }
  }
  return result as StaticNamespacedCaps<F>;
};

const warmupFeatures = async (
  runtime: FeatureRuntime,
  features: readonly ConfiguredFeature[],
): Promise<void> => {
  for (const feature of features) {
    await feature.warmup?.(runtime);
  }
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

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const createApp = <const F extends readonly ConfiguredFeature[]>(
  features: F,
  options?: CreateAppOptions,
): App<F> => {
  const baseConfigs = options?.configs;
  const staticCaps = createStaticCapabilities(features);

  return {
    ...staticCaps,
    ready: async (readyOptions?: ReadyOptions): Promise<ReadyApp<F>> => {
      const container = new Container();

      bindFeatures(container, features);

      const runtime = container.get(AppRuntime);
      const configRegistry = container.get(ConfigRegistry);

      registerConfigs(configRegistry, baseConfigs, undefined);
      registerConfigs(configRegistry, readyOptions?.configs, readyOptions?.fallbackConfigs);
      runtime.applyRegisteredConfigs();

      const readyResult = await runtime.ready();

      const caps = await createNamespacedCapabilities(readyResult, features);

      if (readyOptions?.warmup) {
        await warmupFeatures(readyResult, features);
      }

      const readyApp: ReadyApp<F> = {
        ...caps,
        get: readyResult.get,
        shutdown: () => runtime.shutdown(),
      };

      return attachContainer(readyApp, container);
    },
  };
};
