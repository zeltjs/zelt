import type { Position, ResolvePositionOptions } from '../runtime/position';
import { resolvePosition } from '../runtime/position';
import { getInternalClassMetadata } from '../runtime/store';

export type GetSourcePositionOptions = ResolvePositionOptions;

/**
 * Get the source position where a class decorator was applied.
 * Returns undefined if no decorator metadata exists or position cannot be resolved.
 */
export const getSourcePosition = (
  cls: object,
  options?: GetSourcePositionOptions,
): Position | undefined => {
  const internal = getInternalClassMetadata(cls);
  if (!internal?.trace) return undefined;
  return resolvePosition(internal.trace, options);
};
