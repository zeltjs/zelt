import type { Container } from '@needle-di/core';

export type ConfiguredFeature<TKey extends string = string, TCaps extends object = object> = {
  readonly key: TKey;
  bind(container: Container): void;
  resolve(container: Container): TCaps;
};

export type ExtractCaps<F> = F extends ConfiguredFeature<string, infer Caps> ? Caps : never;

export type IsEmpty<T> = keyof T extends never ? true : false;

export type NamespacedCaps<F extends readonly ConfiguredFeature[]> = {
  readonly [K in F[number] as IsEmpty<ExtractCaps<K>> extends true
    ? never
    : K['key']]: ExtractCaps<K>;
};
