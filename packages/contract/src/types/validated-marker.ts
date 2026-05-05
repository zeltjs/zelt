import type { ValidatedMarker } from '@zeltjs/core';

export type { ValidatedMarker } from '@zeltjs/core';

export type UnwrapValidated<T> = T extends ValidatedMarker<infer U> ? U : never;
