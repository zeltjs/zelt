import type { Container } from '@needle-di/core';

import { getLeaf, isLeafClass } from './leaf';
import { getTransient, isTransientClass } from './transient';

type AnyClass = new (...args: never[]) => unknown;

export const resolve = <T extends object>(
  container: Container,
  cls: new (...args: never[]) => T,
): T => {
  const anyClass: AnyClass = cls;
  if (isLeafClass(anyClass)) {
    return getLeaf(container, cls);
  }
  if (isTransientClass(anyClass)) {
    return getTransient(container, cls);
  }
  return container.get<T>(cls);
};
