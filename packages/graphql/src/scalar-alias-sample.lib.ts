import type { GqlOutput } from './gql-scalar.lib';

export type NullableScalar<T> = T | null;
export type ScalarIdentity<T> = T;
export type ScalarBox<T> = { readonly value: T };
export type ScalarList<T> = readonly T[];
export type ScalarPromise<T> = Promise<T>;
export type ScalarOutput<T> = GqlOutput<T>;
export type DefaultScalar<T, TValue = GqlOutput<T>> = TValue;
