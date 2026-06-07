import type {
  KeyedMethodValue,
  ObjectFromKeyedValues,
  ObjectFromNonEmptyKeyedValues,
} from '@zeltjs/unsafe-type-lib';

export type FeatureRuntime = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
};

type EmptyCapabilities = Record<never, never>;

export abstract class Feature<
  TKey extends string = string,
  TReadyCaps extends object = object,
  TStaticCaps extends object = EmptyCapabilities,
> {
  abstract readonly key: TKey;
  abstract staticCapabilities(): TStaticCaps;
  abstract createCapabilities(runtime: FeatureRuntime): TReadyCaps | Promise<TReadyCaps>;
  warmup?(runtime: FeatureRuntime): Promise<void> | void;
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
  'createCapabilities'
>;

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
  'createCapabilities'
>;

export type StaticNamespacedCaps<F extends readonly ConfiguredFeature[]> =
  ObjectFromNonEmptyKeyedValues<F, 'staticCapabilities'>;
