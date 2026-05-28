import type { InjectionToken, Token as NeedleToken } from '@needle-di/core';
import { Container, inject } from '@needle-di/core';

import { resolve } from './resolve.lib';

type ClassToken<T> = new (...args: never[]) => T;
type AbstractClassToken<T> = abstract new (...args: never[]) => T;

export type Token<T> = ClassToken<T> | AbstractClassToken<T> | string | symbol | InjectionToken<T>;

const isClassToken = <T>(token: Token<T>): boolean =>
  typeof token === 'function' && token.prototype !== undefined;

const needleInject: <T>(token: NeedleToken<T>) => T = inject;

/** @throws {ZeltLifecycleStateError} */
function unifiedInject<T>(token: Token<T>): T {
  if (isClassToken(token)) {
    const container = needleInject(Container);
    return resolve(container, token as new (...args: never[]) => object) as T;
  }
  return needleInject(token as NeedleToken<T>);
}

export { unifiedInject as inject };
