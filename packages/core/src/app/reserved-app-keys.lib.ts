export const RESERVED_APP_KEYS = [
  '__proto__',
  'args',
  'configs',
  'constructor',
  'createRuntime',
  'features',
  'get',
  'getFeatureEntries',
  'hasFeature',
  'prototype',
  'registerShutdown',
  'shutdown',
] as const;

export type ReservedAppKey = (typeof RESERVED_APP_KEYS)[number];

export type FeatureName<TName extends string> = Exclude<TName, ReservedAppKey>;

export type ReservedAppProperties<
  TProperties extends Record<Exclude<keyof TProperties, ReservedAppKey>, never>,
> = TProperties;

export type ValidFeatures<F extends readonly { readonly key: string }[]> = {
  readonly [I in keyof F]: F[I] & { readonly key: FeatureName<F[I]['key']> };
};
