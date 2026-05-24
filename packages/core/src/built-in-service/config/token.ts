import type { Container as ContainerType } from '@needle-di/core';
import { overrideLeaf, registerAsLeaf, resolveLeaf } from '../../kernel/di/leaf';

type AnyConfigClass = new (...args: never[]) => unknown;

export { registerAsLeaf as registerConfigClass };

/** @throws {ZeltLifecycleStateError} */
export const overrideConfig = (
  container: ContainerType,
  config: AnyConfigClass,
  options?: { readonly fallback?: boolean },
): void => {
  overrideLeaf(container, config, options);
};

/** @throws {ZeltLifecycleStateError} */
export const resolveConfig = (container: ContainerType, config: AnyConfigClass): void => {
  resolveLeaf(container, config);
};
