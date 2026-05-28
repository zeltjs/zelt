import type { Token } from '@needle-di/core';
import { Container, inject } from '@needle-di/core';
import { isClassToken } from '@zeltjs/unsafe-type-lib';

import { resolve } from './resolve.lib';

const needleInject: <T>(token: Token<T>) => T = inject;

/** @throws {ZeltLifecycleStateError} */
function unifiedInject<T>(token: Token<T>): T {
  if (isClassToken<T & object>(token)) {
    const container = needleInject(Container);
    return resolve(container, token);
  }
  return needleInject(token);
}

export { unifiedInject as inject };
