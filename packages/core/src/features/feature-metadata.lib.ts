import type { ConfiguredFeature, FeatureCaps, FeatureClass } from './feature.types';

const FEATURES = Symbol('zelt.features');

type FeatureMetadataHost = {
  readonly [FEATURES]?: readonly ConfiguredFeature[];
};

type StaticFeatureAppLike = {
  readonly createRuntime: (...args: never[]) => unknown;
};

export const attachFeatureClasses = <TApp extends object>(
  app: TApp,
  features: readonly ConfiguredFeature[],
): TApp => {
  if (FEATURES in app) {
    return app;
  }

  Object.defineProperty(app, FEATURES, {
    value: [...features],
    // Keep this symbol enumerable so object spread preserves feature identity metadata.
    enumerable: true,
    configurable: false,
    writable: false,
  });

  return app;
};

export function hasFeature<TFeatureClass extends FeatureClass>(
  app: StaticFeatureAppLike,
  featureClass: TFeatureClass,
): boolean;

export function hasFeature<TApp extends object, TFeatureClass extends FeatureClass>(
  app: TApp,
  featureClass: TFeatureClass,
): app is TApp & FeatureCaps<InstanceType<TFeatureClass>>;

export function hasFeature(app: object, featureClass: FeatureClass): boolean {
  const host = app as FeatureMetadataHost;
  return host[FEATURES]?.some((feature) => feature instanceof featureClass) ?? false;
}
