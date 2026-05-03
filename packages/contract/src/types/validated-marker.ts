import type { ValidatedMarker } from '@koya/core';

export type { ValidatedMarker } from '@koya/core';

export type UnwrapValidated<T> = T extends ValidatedMarker<infer U> ? U : never;
