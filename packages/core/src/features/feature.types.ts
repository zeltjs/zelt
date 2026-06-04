import type { Container } from '@needle-di/core';
import type { ObjectFromKeyedValues } from '@zeltjs/unsafe-type-lib';

export type FeatureRuntime = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
};

type FeatureBase<TKey extends string, TReadyCaps extends object> = {
  readonly key: TKey;
  bind(container: Container): void;
  createCapabilities(runtime: FeatureRuntime): TReadyCaps | Promise<TReadyCaps>;
  warmup?(runtime: FeatureRuntime): Promise<void> | void;
};

type FeatureWithStatic<
  TKey extends string,
  TReadyCaps extends object,
  TStaticCaps extends object,
> = FeatureBase<TKey, TReadyCaps> & {
  staticCapabilities(): TStaticCaps;
};

export type ConfiguredFeature<
  TKey extends string = string,
  TReadyCaps extends object = object,
  TStaticCaps extends object | undefined = undefined,
> = [TStaticCaps] extends [undefined]
  ? FeatureBase<TKey, TReadyCaps>
  : TStaticCaps extends object
    ? FeatureWithStatic<TKey, TReadyCaps, TStaticCaps>
    : FeatureBase<TKey, TReadyCaps>;

export type ExtractCaps<F> = F extends ConfiguredFeature<string, infer Caps> ? Caps : never;

export type NamespacedCaps<F extends readonly ConfiguredFeature[]> = ObjectFromKeyedValues<
  F,
  'createCapabilities'
>;

type ExtractStaticFeature<T> = T extends {
  readonly key: infer TKey extends string;
  staticCapabilities(): infer TStatic;
}
  ? { readonly key: TKey; staticCapabilities(): TStatic }
  : never;

type StaticFeatures<F extends readonly ConfiguredFeature[]> = readonly ExtractStaticFeature<
  F[number]
>[];

export type StaticNamespacedCaps<F extends readonly ConfiguredFeature[]> = ObjectFromKeyedValues<
  StaticFeatures<F>,
  'staticCapabilities'
>;
