export type { ReadyResult } from './app-bootstrap.lib';
export { AppBootstrap } from './app-bootstrap.lib';
export { ConfigRegistry } from './config-registry.lib';
export {
  type App,
  type CreateAppOptions,
  type CreateRuntimeOptions,
  createApp,
  type RuntimeApp,
} from './create-app.lib';
export type {
  ConfiguredFeature,
  FeatureCaps,
  FeatureClass,
  FeatureEntry,
  FeatureManagedClass,
  FeatureReadyCapabilities,
  NamespacedCaps,
  RegisteredRuntimeShutdown,
  RegisterRuntimeShutdown,
  RuntimeShutdownCallback,
  RuntimeShutdownOptions,
  ServiceResolver,
  StaticNamespacedCaps,
  ZeltPrebuilt,
} from './feature.types';
export { Feature } from './feature.types';
export { FeatureInjectionError } from './feature-registry.service';
export { injectFeature } from './inject-feature.lib';
export { attachContainer, type Override, override } from './override.lib';
export type {
  FeatureName,
  ReservedAppKey,
  ReservedAppProperties,
  ValidFeatures,
} from './reserved-app-keys.lib';
export { RESERVED_APP_KEYS } from './reserved-app-keys.lib';
export { RuntimeShutdownService } from './runtime-shutdown.service';
