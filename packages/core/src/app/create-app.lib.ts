import { Container } from '@needle-di/core';
import type { KeyedValues } from '@zeltjs/unsafe-type-lib';
import {
  unsafeGetKeyedValueForClass,
  unsafeKeyedValues,
  unsafeObjectFromNonEmptyKeyedValuesSync,
} from '@zeltjs/unsafe-type-lib';

import type { ConfigClass } from '../built-in-service';
import { ZeltAppConfigurationError } from '../kernel';
import { AppRuntime } from './app-runtime.lib';
import { ConfigRegistry } from './config-registry.lib';
import type {
  ConfiguredFeature,
  FeatureClass,
  FeatureReadyCapabilities,
  NamespacedCaps,
  ServiceResolver,
  StaticNamespacedCaps,
} from './feature.types';
import { attachContainer } from './override.lib';

export type CreateAppOptions = {
  readonly configs?: readonly ConfigClass<object>[];
};

export type CreateRuntimeOptions = {
  readonly configs?: readonly ConfigClass<object>[];
  readonly fallbackConfigs?: readonly ConfigClass<object>[];
  readonly warmup?: boolean;
};

export type App<F extends readonly ConfiguredFeature[]> = {
  readonly features: Readonly<F>;
  readonly hasFeature: (featureClass: FeatureClass) => boolean;
  readonly getFeatureCapabilities: <TFeatureClass extends FeatureClass>(
    featureClass: TFeatureClass,
  ) => undefined;
  readonly createRuntime: (options?: CreateRuntimeOptions) => Promise<RuntimeApp<F>>;
} & StaticNamespacedCaps<F>;

export type RuntimeApp<F extends readonly ConfiguredFeature[]> = {
  readonly features: Readonly<F>;
  readonly hasFeature: (featureClass: FeatureClass) => boolean;
  readonly getFeatureCapabilities: <TFeatureClass extends FeatureClass>(
    featureClass: TFeatureClass,
  ) => FeatureReadyCapabilities<InstanceType<TFeatureClass>> | undefined;
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
  readonly shutdown: () => Promise<void>;
} & NamespacedCaps<F>;

// ─── Helpers ───

const reservedFeatureKeys = new Set([
  '__proto__',
  'createRuntime',
  'constructor',
  'features',
  'get',
  'getFeatureCapabilities',
  'hasFeature',
  'prototype',
  'shutdown',
]);

/** @throws {ZeltAppConfigurationError} */
const assertUniqueFeatureKeys = (features: readonly ConfiguredFeature[]): void => {
  const seen = new Set<string>();
  for (const feature of features) {
    if (reservedFeatureKeys.has(feature.key)) {
      throw new ZeltAppConfigurationError({
        reason: 'reserved_feature_key',
        details: feature.key,
      });
    }
    if (seen.has(feature.key)) {
      throw new ZeltAppConfigurationError({
        reason: 'duplicate_feature_key',
        details: feature.key,
      });
    }
    seen.add(feature.key);
  }
};

const realizeNamespacedCapabilities = async <const F extends readonly ConfiguredFeature[]>(
  resolver: ServiceResolver,
  features: F,
): Promise<KeyedValues<F, 'realize'>> => {
  return unsafeKeyedValues(features, 'realize', resolver);
};

const collectBlueprints = <const F extends readonly ConfiguredFeature[]>(
  features: F,
): StaticNamespacedCaps<F> => {
  return unsafeObjectFromNonEmptyKeyedValuesSync(features, 'blueprint');
};

const warmupFeatureClasses = async (
  resolver: ServiceResolver,
  features: readonly ConfiguredFeature[],
): Promise<void> => {
  for (const feature of features) {
    for (const cls of feature.featureClasses()) {
      await resolver.get(cls);
    }
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

const hasFeature = (
  features: readonly ConfiguredFeature[],
  featureClass: FeatureClass,
): boolean => {
  return features.some((feature) => feature instanceof featureClass);
};

/** @throws {ZeltAppConfigurationError | ZeltDecoratorUsageError | ZeltReadyFailedError | ZeltLifecycleStateError} */
export const createApp = <const F extends readonly ConfiguredFeature[]>(
  features: F,
  options?: CreateAppOptions,
): App<F> => {
  assertUniqueFeatureKeys(features);

  const baseConfigs = options?.configs;
  const staticCaps = collectBlueprints(features);

  const app = {
    ...staticCaps,
    createRuntime: async (runtimeOptions?: CreateRuntimeOptions): Promise<RuntimeApp<F>> => {
      const container = new Container();

      const runtime = container.get(AppRuntime);
      const configRegistry = container.get(ConfigRegistry);

      registerConfigs(configRegistry, baseConfigs, undefined);
      registerConfigs(configRegistry, runtimeOptions?.configs, runtimeOptions?.fallbackConfigs);
      runtime.applyRegisteredConfigs();

      const readyResult = await runtime.ready();

      const caps = await realizeNamespacedCapabilities(readyResult, features);

      if (runtimeOptions?.warmup) {
        await warmupFeatureClasses(readyResult, features);
      }

      const readyApp: RuntimeApp<F> = {
        ...caps.object,
        features,
        hasFeature: (featureClass) => hasFeature(features, featureClass),
        getFeatureCapabilities: (featureClass) =>
          unsafeGetKeyedValueForClass(features, caps.map, featureClass),
        get: readyResult.get,
        shutdown: () => runtime.shutdown(),
      };

      return attachContainer(readyApp, container);
    },
  };

  return {
    ...app,
    features,
    hasFeature: (featureClass) => hasFeature(features, featureClass),
    getFeatureCapabilities: () => undefined,
  };
};
