import type {
  KeyedMethodValue,
  ObjectFromKeyedValues,
  ObjectFromNonEmptyKeyedValues,
} from '@zeltjs/unsafe-type-lib';

export type ServiceResolver = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
};

export type FeatureManagedClass = new (...args: never[]) => object;

type EmptyCapabilities = Record<never, never>;

export abstract class Feature<
  TKey extends string = string,
  TReadyCaps extends object = object,
  TStaticCaps extends object = EmptyCapabilities,
> {
  abstract readonly key: TKey;
  abstract featureClasses(): readonly FeatureManagedClass[];
  abstract blueprint(): TStaticCaps;
  abstract realize(resolver: ServiceResolver): TReadyCaps | Promise<TReadyCaps>;
  shutdown?(): void | Promise<void>;
}

export type ConfiguredFeature<
  TKey extends string = string,
  TReadyCaps extends object = object,
  TStaticCaps extends object = EmptyCapabilities,
> = Feature<TKey, TReadyCaps, TStaticCaps>;

export type FeatureClass<TFeature extends ConfiguredFeature = ConfiguredFeature> = abstract new (
  ...args: never[]
) => TFeature;

export type FeatureReadyCapabilities<TFeature extends ConfiguredFeature> = KeyedMethodValue<
  TFeature,
  'realize'
>;

export type FeatureEntry<TFeature extends ConfiguredFeature> = {
  readonly key: TFeature['key'];
  readonly feature: TFeature;
  readonly capabilities: FeatureReadyCapabilities<TFeature>;
};

export type FeatureCaps<TFeature extends ConfiguredFeature> = {
  readonly [TKey in TFeature['key']]: TFeature extends ConfiguredFeature<
    TFeature['key'],
    infer TReadyCaps,
    object
  >
    ? TReadyCaps
    : never;
};

export type NamespacedCaps<F extends readonly ConfiguredFeature[]> = ObjectFromKeyedValues<
  F,
  'realize'
>;

export type StaticNamespacedCaps<F extends readonly ConfiguredFeature[]> =
  ObjectFromNonEmptyKeyedValues<F, 'blueprint'>;
