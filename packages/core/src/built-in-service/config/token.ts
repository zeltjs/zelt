import type { Container as ContainerType } from '@needle-di/core';
import { getLeaf, overrideLeaf, registerAsLeaf, resolveLeaf } from '../../kernel/di/leaf';

import type { ConfigClass } from './types';

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

/** @throws {ZeltLifecycleStateError} */
export const getConfig = <T extends object>(
  container: ContainerType,
  configClass: ConfigClass<T>,
): T => getLeaf(container, configClass);
