import { Container } from '@needle-di/core';

import type { ConfigClass } from '../built-in-service/config';
import type { ConfiguredFeature, NamespacedCaps } from '../features/feature.types';
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

export type App<F extends readonly ConfiguredFeature[] = readonly ConfiguredFeature[]> = {
  readonly ready: (options?: ReadyOptions) => Promise<ReadyApp<F>>;
};

export type ReadyApp<F extends readonly ConfiguredFeature[] = readonly ConfiguredFeature[]> = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
  readonly shutdown: () => Promise<void>;
} & NamespacedCaps<F>;

// ─── Helpers ───

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

/** @throws {ZeltDecoratorUsageError | ZeltLifecycleStateError} */
export const createApp = <const F extends readonly ConfiguredFeature[]>(
  features: [...F],
  options?: CreateAppOptions,
): App<F> => {
  const baseConfigs = options?.configs;

  return {
    ready: async (readyOptions?: ReadyOptions): Promise<ReadyApp<F>> => {
      const container = new Container();

      bindFeatures(container, features);

      const runtime = container.get(AppRuntime);
      const configRegistry = container.get(ConfigRegistry);

      // Configs must be registered before resolving caps,
      // otherwise services that depend on Config classes get default values
      registerConfigs(configRegistry, baseConfigs, undefined);
      registerConfigs(configRegistry, readyOptions?.configs, readyOptions?.fallbackConfigs);

      const caps = resolveNamespacedCaps(container, features);

      const readyResult = await runtime.ready(
        readyOptions?.warmup !== undefined ? { warmup: readyOptions.warmup } : undefined,
      );

      const readyApp = {
        ...caps,
        get: readyResult.get,
        shutdown: () => runtime.shutdown(),
      } as ReadyApp<F>;

      return attachContainer(readyApp, container);
    },
  };
};
