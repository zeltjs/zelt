import { getInternalClassMetadata } from '../runtime/index';
import type { Position, ResolvePositionOptions } from './position.lib';
import { resolvePosition } from './position.lib';

export type GetSourcePositionOptions = ResolvePositionOptions;

/**
 * Get the captured class decorator factory expression position.
 * This is not an importable class reference or an AST declaration position.
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
