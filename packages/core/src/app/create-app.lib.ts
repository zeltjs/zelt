import { Container } from '@needle-di/core';
import type { KeyedValues } from '@zeltjs/unsafe-type-lib';
import {
  unsafeGetKeyedValueEntriesForClass,
  unsafeKeyedValues,
  unsafeObjectFromNonEmptyKeyedValuesSync,
} from '@zeltjs/unsafe-type-lib';

import type { ConfigClass } from '../built-in-service';
import { ZeltAppConfigurationError } from '../kernel';
import { AppBootstrap } from './app-bootstrap.lib';
import { ConfigRegistry } from './config-registry.lib';
import type {
  ConfiguredFeature,
  FeatureClass,
  FeatureEntry,
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
  readonly createRuntime: (options?: CreateRuntimeOptions) => Promise<RuntimeApp<F>>;
} & StaticNamespacedCaps<F>;

export type RuntimeApp<F extends readonly ConfiguredFeature[]> = {
  readonly features: Readonly<F>;
  readonly hasFeature: (featureClass: FeatureClass) => boolean;
  readonly getFeatureEntries: <TFeatureClass extends FeatureClass>(
    featureClass: TFeatureClass,
  ) => readonly FeatureEntry<InstanceType<TFeatureClass>>[];
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
  'getFeatureEntries',
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

/** @throws {AggregateError | ZeltLifecycleStateError} */
const shutdownFeatures = async (features: readonly ConfiguredFeature[]): Promise<void> => {
  const results = await Promise.allSettled(features.map((feature) => feature.shutdown?.()));
  const errors: unknown[] = [];
  for (const result of results) {
    if (result.status === 'rejected') errors.push(result.reason);
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'One or more feature shutdown hooks failed');
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

/** @throws {AggregateError | ZeltLifecycleStateError | ZeltReadyFailedError | ZeltAppConfigurationError} */
const createRuntimeApp = async <const F extends readonly ConfiguredFeature[]>(
  features: F,
  baseConfigs: readonly ConfigClass<object>[] | undefined,
  runtimeOptions: CreateRuntimeOptions | undefined,
): Promise<RuntimeApp<F>> => {
  const container = new Container();
  const runtime = container.get(AppBootstrap);
  const configRegistry = container.get(ConfigRegistry);

  registerConfigs(configRegistry, baseConfigs, undefined);
  registerConfigs(configRegistry, runtimeOptions?.configs, runtimeOptions?.fallbackConfigs);
  runtime.applyRegisteredConfigs();

  const readyResult = await runtime.ready();
  const caps = await realizeNamespacedCapabilities(readyResult, features);

  if (runtimeOptions?.warmup) {
    await warmupFeatureClasses(readyResult, features);
  }

  let shuttingDown = false;
  /** @throws {AggregateError | ZeltLifecycleStateError} */
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await shutdownFeatures(features);
    } finally {
      await runtime.shutdown();
    }
  };

  const readyApp: RuntimeApp<F> = {
    ...caps.object,
    features,
    hasFeature: (featureClass) => hasFeature(features, featureClass),
    getFeatureEntries: (featureClass) =>
      unsafeGetKeyedValueEntriesForClass(features, caps.map, featureClass).map((entry) => ({
        key: entry.key,
        feature: entry.item,
        capabilities: entry.value,
      })),
    get: readyResult.get,
    shutdown,
  };

  return attachContainer(readyApp, container);
};

/** @throws {AggregateError | ZeltAppConfigurationError | ZeltDecoratorUsageError | ZeltReadyFailedError | ZeltLifecycleStateError} */
export const createApp = <const F extends readonly ConfiguredFeature[]>(
  features: F,
  options?: CreateAppOptions,
): App<F> => {
  assertUniqueFeatureKeys(features);

  const baseConfigs = options?.configs;
  const staticCaps = collectBlueprints(features);

  const app = {
    ...staticCaps,
    createRuntime: (runtimeOptions?: CreateRuntimeOptions): Promise<RuntimeApp<F>> =>
      createRuntimeApp(features, baseConfigs, runtimeOptions),
  };

  return {
    ...app,
    features,
    hasFeature: (featureClass) => hasFeature(features, featureClass),
  };
};
