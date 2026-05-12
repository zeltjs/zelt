import type { Container as ContainerType } from '@needle-di/core';
import { getLeaf, overrideLeaf, registerAsLeaf, resolveLeaf } from '../di/leaf';

import type { ConfigClass } from './types';

type AnyConfigClass = new (...args: never[]) => unknown;

export { registerAsLeaf as registerConfigClass };

export const overrideConfig = (
  container: ContainerType,
  config: AnyConfigClass,
  options?: { readonly fallback?: boolean },
): void => {
  overrideLeaf(container, config, options);
};

export const resolveConfig = (container: ContainerType, config: AnyConfigClass): void => {
  resolveLeaf(container, config);
};

export const getConfig = <T extends object>(
  container: ContainerType,
  configClass: ConfigClass<T>,
): T => getLeaf(container, configClass);
