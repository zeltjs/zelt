import { Container } from '@needle-di/core';
import type { KeyedValues } from '@zeltjs/unsafe-type-lib';
import {
  unsafeGetKeyedValueEntriesForClass,
  unsafeKeyedValues,
  unsafeMapKeyedValues,
  unsafeObjectFromNonEmptyKeyedValuesSync,
} from '@zeltjs/unsafe-type-lib';

import type { ConfigClass } from '../built-in-service';
import type { ContextMode } from '../kernel';
import { ContextRuntimeService, ZeltAppConfigurationError } from '../kernel';
import { AppBootstrap } from './app-bootstrap.lib';
import { ConfigRegistry } from './config-registry.lib';
import type {
  ConfiguredFeature,
  FeatureClass,
  FeatureEntry,
  NamespacedCaps,
  RegisterRuntimeShutdown,
  ServiceResolver,
  StaticNamespacedCaps,
  ZeltPrebuilt,
} from './feature.types';
import { FeatureInjectionError, FeatureRegistryService } from './feature-registry.service';
import { attachContainer } from './override.lib';
import type { ReservedAppProperties, ValidFeatures } from './reserved-app-keys.lib';
import { RESERVED_APP_KEYS } from './reserved-app-keys.lib';
import { RuntimeShutdownService } from './runtime-shutdown.service';

export type CreateAppOptions = {
  readonly configs?: readonly ConfigClass<object>[];
};

export type CreateRuntimeOptions = {
  readonly contextMode?: ContextMode;
  readonly configs?: readonly ConfigClass<object>[];
  readonly fallbackConfigs?: readonly ConfigClass<object>[];
  readonly warmup?: boolean;
  readonly prebuilt?: ZeltPrebuilt;
};

export type App<F extends readonly ConfiguredFeature[]> = ReservedAppProperties<{
  readonly features: Readonly<F>;
  readonly configs: readonly ConfigClass<object>[];
  readonly hasFeature: (featureClass: FeatureClass) => boolean;
  readonly createRuntime: (options?: CreateRuntimeOptions) => Promise<RuntimeApp<F>>;
}> &
  StaticNamespacedCaps<F>;

export type RuntimeApp<F extends readonly ConfiguredFeature[]> = ReservedAppProperties<{
  readonly features: Readonly<F>;
  readonly hasFeature: (featureClass: FeatureClass) => boolean;
  readonly getFeatureEntries: <TFeatureClass extends FeatureClass>(
    featureClass: TFeatureClass,
  ) => readonly FeatureEntry<InstanceType<TFeatureClass>>[];
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
  readonly registerShutdown: RegisterRuntimeShutdown;
  readonly shutdown: () => Promise<void>;
}> &
  NamespacedCaps<F>;

// ─── Helpers ───

const reservedFeatureKeys = /* @__PURE__ */ new Set<string>(RESERVED_APP_KEYS);

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

/** @throws {FeatureInjectionError} */
const publishFeatureCapabilities = <const F extends readonly ConfiguredFeature[]>(
  features: F,
  caps: KeyedValues<F, 'realize'>,
  registry: FeatureRegistryService,
): void => {
  for (const feature of features) {
    const value = caps.map.get(feature);
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      throw new FeatureInjectionError('invalid_capabilities', feature.key);
    }
    registry.publish(feature, value);
  }
};

/** @throws {AggregateError | ZeltLifecycleStateError | ZeltReadyFailedError | FeatureInjectionError | ZeltAppConfigurationError} */
const initializeRuntimeFeatures = async <const F extends readonly ConfiguredFeature[]>(
  features: F,
  context: {
    runtime: AppBootstrap;
    featureRegistry: FeatureRegistryService;
    resolver: ServiceResolver;
    shutdown: () => Promise<void>;
    warmup: boolean;
  },
) => {
  const { runtime, featureRegistry, resolver, shutdown, warmup } = context;
  try {
    await runtime.prepareConfigs();
    const caps = await realizeNamespacedCapabilities(resolver, features);
    publishFeatureCapabilities(features, caps, featureRegistry);
    if (warmup) await warmupFeatureClasses(resolver, features);
    featureRegistry.activate();
    const readyResult = await runtime.ready();
    return { caps, readyResult };
  } catch (error) {
    try {
      await shutdown();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Feature initialization and cleanup failed');
    }
    throw error;
  }
};

/** @throws {AggregateError | ZeltLifecycleStateError | ZeltReadyFailedError | ZeltAppConfigurationError | FeatureInjectionError | TypeError} */
const createRuntimeApp = async <const F extends readonly ConfiguredFeature[]>(
  features: F,
  baseConfigs: readonly ConfigClass<object>[] | undefined,
  runtimeOptions: CreateRuntimeOptions | undefined,
): Promise<RuntimeApp<F>> => {
  const container = new Container();
  container.bind({
    provide: ContextRuntimeService,
    useValue: new ContextRuntimeService(runtimeOptions?.contextMode),
  });
  const runtime = container.get(AppBootstrap);
  const configRegistry = container.get(ConfigRegistry);
  const featureRegistry = container.get(FeatureRegistryService);
  const { registerShutdown, shutdown } = container.get(RuntimeShutdownService);

  featureRegistry.prepare(features);

  registerConfigs(configRegistry, baseConfigs, undefined);
  registerConfigs(configRegistry, runtimeOptions?.configs, runtimeOptions?.fallbackConfigs);
  const resolver: ServiceResolver = {
    // Realization may construct consumers, but their startup hooks must wait
    // until every feature has published its capabilities.
    get: <T extends object>(cls: new (...args: never[]) => T): Promise<T> => runtime.get(cls),
    registerShutdown,
    prebuilt: runtimeOptions?.prebuilt,
  };
  const { readyResult } = await initializeRuntimeFeatures(features, {
    runtime,
    featureRegistry,
    resolver,
    shutdown,
    warmup: runtimeOptions?.warmup ?? false,
  });
  const published = unsafeMapKeyedValues<F, 'realize'>(features, (feature) =>
    featureRegistry.get(feature),
  );

  const readyApp: RuntimeApp<F> = {
    ...published.object,
    features,
    hasFeature: (featureClass) => hasFeature(features, featureClass),
    getFeatureEntries: (featureClass) =>
      unsafeGetKeyedValueEntriesForClass(features, published.map, featureClass).map((entry) => ({
        key: entry.key,
        feature: entry.item,
        capabilities: entry.value,
      })),
    get: readyResult.get,
    registerShutdown,
    shutdown,
  };

  return attachContainer(readyApp, container);
};

/** @throws {AggregateError | ZeltAppConfigurationError | ZeltDecoratorUsageError | ZeltReadyFailedError | ZeltLifecycleStateError | FeatureInjectionError | TypeError} */
export const createApp = <const F extends readonly ConfiguredFeature[]>(
  features: F & ValidFeatures<F>,
  options?: CreateAppOptions,
): App<F> => {
  assertUniqueFeatureKeys(features);

  const baseConfigs = options?.configs;
  const staticCaps = collectBlueprints<F>(features);

  const app = {
    ...staticCaps,
    createRuntime: (runtimeOptions?: CreateRuntimeOptions): Promise<RuntimeApp<F>> =>
      createRuntimeApp<F>(features, baseConfigs, runtimeOptions),
  };

  return {
    ...app,
    features,
    configs: baseConfigs ?? [],
    hasFeature: (featureClass) => hasFeature(features, featureClass),
  };
};
