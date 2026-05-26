import type { Container } from '@needle-di/core';
import { overrideLeaf, registerAsLeaf, resolveLeaf } from '../../kernel/di/leaf';

type AnyConfigClass = new (...args: never[]) => unknown;

export { registerAsLeaf as registerConfigClass };

/** @throws {ZeltLifecycleStateError} */
export const overrideConfig = (
  container: Container,
  config: AnyConfigClass,
  options?: { readonly fallback?: boolean },
): void => {
  overrideLeaf(container, config, options);
};

/** @throws {ZeltLifecycleStateError} */
export const resolveConfig = (container: Container, config: AnyConfigClass): void => {
  resolveLeaf(container, config);
};
