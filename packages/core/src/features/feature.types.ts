import type { Container } from '@needle-di/core';
import type { ObjectFromKeyedValues } from '@zeltjs/unsafe-type-lib';

export type FeatureRuntime = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
};

export type ConfiguredFeature<TKey extends string = string, TCaps extends object = object> = {
  readonly key: TKey;
  bind(container: Container): void;
  createCapabilities(runtime: FeatureRuntime): TCaps | Promise<TCaps>;
  warmup?(runtime: FeatureRuntime): Promise<void> | void;
};

export type ExtractCaps<F> = F extends ConfiguredFeature<string, infer Caps> ? Caps : never;

export type NamespacedCaps<F extends readonly ConfiguredFeature[]> = ObjectFromKeyedValues<
  F,
  'createCapabilities'
>;
