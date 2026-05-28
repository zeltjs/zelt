import type { InjectionToken, Token } from '@needle-di/core';
import { Container, inject } from '@needle-di/core';

import { resolve } from './resolve.lib';

type ClassToken<T> = new (...args: never[]) => T;
type AbstractClassToken<T> = abstract new (...args: never[]) => T;

type InjectionTarget<T> =
  | ClassToken<T>
  | AbstractClassToken<T>
  | string
  | symbol
  | InjectionToken<T>;

const isClassToken = <T>(token: InjectionTarget<T>): boolean =>
  typeof token === 'function' && token.prototype !== undefined;

const needleInject: <T>(token: Token<T>) => T = inject;

/** @throws {ZeltLifecycleStateError} */
function unifiedInject<T>(token: InjectionTarget<T>): T {
  if (isClassToken(token)) {
    const container = needleInject(Container);
    return resolve(container, token as new (...args: never[]) => object) as T;
  }
  return needleInject(token as Token<T>);
}

export { unifiedInject as inject };
