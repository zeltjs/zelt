import type { Token } from '@needle-di/core';
import { Container, inject } from '@needle-di/core';
import { isClassConstructor } from '@zeltjs/unsafe-type-lib';

import { getLeaf, isLeafClass } from './leaf.lib';
import { resolve } from './resolve.lib';

const needleInject: <T>(token: Token<T>) => T = inject;

/** @throws {ZeltLifecycleStateError} */
function unifiedInject<T>(token: Token<T>): T {
  if (isClassConstructor<T & object>(token)) {
    const container = needleInject(Container);
    if (isLeafClass(token)) {
      return getLeaf(container, token);
    }
    return resolve(container, token);
  }
  return needleInject(token);
}

export { unifiedInject as inject };
