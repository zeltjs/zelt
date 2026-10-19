import { getInternalClassMetadata } from '../runtime/index';
import type { Position } from './position.lib';
import { resolvePosition } from './position.lib';

export type DecoratorApplicationTarget =
  | { kind: 'class' }
  | { kind: 'method'; readonly name: string | symbol };

// Return the define-time expression for this specific application. The call
// trace identifies its activation; ordered outer frames distinguish same-file
// wrappers. A truncated or ambiguous trace remains unresolved. Coordinates of
// transpiler-generated application frames must never replace expression positions.
export const getDecoratorApplicationPosition = (
  cls: object,
  target: DecoratorApplicationTarget,
  matchesProps: (props: object) => boolean,
): Position | undefined => {
  const internal = getInternalClassMetadata(cls);
  if (internal === undefined) return undefined;
  const holder =
    target.kind === 'class' ? internal : internal.methods.find((m) => m.name === target.name);
  if (holder === undefined) return undefined;
  const index = holder.props.findIndex(matchesProps);
  if (index === -1) return undefined;
  return resolvePosition(holder.propTraces[index]);
};
