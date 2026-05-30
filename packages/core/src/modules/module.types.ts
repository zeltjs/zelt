import type { Container } from '@needle-di/core';

export type Module<
  TKey extends string = string,
  TConfig = unknown,
  TCaps extends object = object,
> = {
  readonly key: TKey;
  // method syntax for bivariant assignability on TConfig
  bind(container: Container, config: TConfig): void;
  readonly resolve: (container: Container) => TCaps;
};

// --- Type utilities ---

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

type SingleModuleConfig<M> = M extends {
  readonly key: infer K extends string;
  readonly bind: (container: never, config: infer C) => void;
}
  ? { readonly [P in K]?: C }
  : never;

export type ModuleConfigMap<M extends readonly Module[]> = UnionToIntersection<
  SingleModuleConfig<M[number]>
>;

export type ModuleCapsMap<M extends readonly Module[], TConfig> = M extends readonly [
  infer First extends Module,
  ...infer Rest extends readonly Module[],
]
  ? ModuleCapsEntry<First, TConfig> & ModuleCapsMap<Rest, TConfig>
  : object;

type ExtractCaps<M> = M extends Module<string, unknown, infer Caps> ? Caps : object;

export type ModuleCapsAll<M extends readonly Module[]> = M extends readonly [
  infer First extends Module,
  ...infer Rest extends readonly Module[],
]
  ? ExtractCaps<First> & ModuleCapsAll<Rest>
  : object;

type ModuleCapsEntry<M, TConfig> = M extends {
  readonly key: infer K extends string;
  readonly bind: (container: never, config: infer C) => void;
  readonly resolve: (container: never) => infer Caps;
}
  ? K extends keyof TConfig
    ? TConfig[K] extends C
      ? Caps
      : object
    : object
  : object;
