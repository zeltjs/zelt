import { inject } from '../kernel';
import type { ConfiguredFeature, FeatureClass, FeatureReadyCapabilities } from './feature.types';
import { FeatureRegistryService } from './feature-registry.service';

export function injectFeature<TFeature extends ConfiguredFeature>(
  feature: TFeature,
): FeatureReadyCapabilities<TFeature>;
export function injectFeature<TFeature extends ConfiguredFeature>(
  feature: FeatureClass<TFeature>,
  name?: string,
): FeatureReadyCapabilities<TFeature>;
/**
 * Acquires a reference only; calling its operations requires completed feature initialization.
 * @throws {FeatureInjectionError}
 */
export function injectFeature(feature: ConfiguredFeature | FeatureClass, name?: string): object {
  return inject(FeatureRegistryService).get(feature, name);
}
