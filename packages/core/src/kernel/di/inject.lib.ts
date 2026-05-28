import type { Token } from '@needle-di/core';
import { Container, inject } from '@needle-di/core';

import { resolve } from './resolve.lib';

const needleInject: <T>(token: Token<T>) => T = inject;

/** @throws {ZeltLifecycleStateError} */
function unifiedInject<T>(token: Token<T>): T {
  if (typeof token === 'function' && token.prototype !== undefined) {
    const container = needleInject(Container);
    return resolve(container, token as new (...args: never[]) => object) as T;
  }
  return needleInject(token);
}

export { unifiedInject as inject };
