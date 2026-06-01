import type { Container } from '@needle-di/core';

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

export type IsEmpty<T> = keyof T extends never ? true : false;

export type NamespacedCaps<F extends readonly ConfiguredFeature[]> = {
  readonly [K in F[number] as IsEmpty<ExtractCaps<K>> extends true
    ? never
    : K['key']]: ExtractCaps<K>;
};
