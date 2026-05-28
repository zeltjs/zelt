export const isClassToken = <T extends object = object>(
  value: unknown,
): value is new (
  ...args: never[]
) => T => typeof value === 'function' && 'prototype' in value;
