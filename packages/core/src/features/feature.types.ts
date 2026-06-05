import type { Container } from '@needle-di/core';
import type { ObjectFromKeyedValues, ObjectFromNonEmptyKeyedValues } from '@zeltjs/unsafe-type-lib';

export type FeatureRuntime = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
};

type EmptyCapabilities = Record<never, never>;

export type ConfiguredFeature<
  TKey extends string = string,
  TReadyCaps extends object = object,
  TStaticCaps extends object = EmptyCapabilities,
> = {
  readonly key: TKey;
  bind(container: Container): void;
  staticCapabilities(): TStaticCaps;
  createCapabilities(runtime: FeatureRuntime): TReadyCaps | Promise<TReadyCaps>;
  warmup?(runtime: FeatureRuntime): Promise<void> | void;
};

export type ExtractCaps<F> = F extends ConfiguredFeature<string, infer Caps> ? Caps : never;

export type NamespacedCaps<F extends readonly ConfiguredFeature[]> = ObjectFromKeyedValues<
  F,
  'createCapabilities'
>;

export type StaticNamespacedCaps<F extends readonly ConfiguredFeature[]> =
  ObjectFromNonEmptyKeyedValues<F, 'staticCapabilities'>;
