import type { ConfiguredFeature, FeatureCaps, FeatureClass } from './feature.types';

const FEATURE_CLASSES = Symbol('zelt.featureClasses');

type FeatureMetadataHost = {
  readonly [FEATURE_CLASSES]?: ReadonlySet<FeatureClass>;
};

type StaticFeatureAppLike = {
  readonly createRuntime: (...args: never[]) => unknown;
};

export const attachFeatureClasses = <TApp extends object>(
  app: TApp,
  features: readonly ConfiguredFeature[],
): TApp => {
  if (FEATURE_CLASSES in app) {
    return app;
  }

  Object.defineProperty(app, FEATURE_CLASSES, {
    value: new Set(features.map((feature) => feature.constructor as FeatureClass)),
    enumerable: false,
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
  return host[FEATURE_CLASSES]?.has(featureClass) ?? false;
}
