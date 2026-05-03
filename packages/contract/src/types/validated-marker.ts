export type { ValidatedMarker, ExtractValidated, IsValidated } from '@koya/core';
import type { ValidatedMarker } from '@koya/core';

export type UnwrapValidated<T> = T extends ValidatedMarker<infer U> ? U : never;
