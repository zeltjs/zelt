import type { inject as InjectFn, InjectionToken, Token } from '@needle-di/core';
import { Container, inject } from '@needle-di/core';

import { resolve } from './resolve.lib';

const isClassToken = <T>(token: Token<T>): boolean =>
  typeof token === 'function' && token.prototype !== undefined;

const needleInject: typeof InjectFn = inject;

/** @throws {ZeltLifecycleStateError} */
function unifiedInject<T>(token: InjectionToken<T>): T;
function unifiedInject<T>(token: Token<T>): T;
function unifiedInject<T>(token: Token<T>, options: { multi: true }): T[];
function unifiedInject<T>(token: Token<T>, options: { optional: true }): T | undefined;
function unifiedInject<T>(
  token: Token<T>,
  options: { multi: true; optional: true },
): T[] | undefined;
function unifiedInject<T>(token: Token<T>, options: { lazy: true }): () => T;
function unifiedInject<T>(token: Token<T>, options: { lazy: true; multi: true }): () => T[];
function unifiedInject<T>(
  token: Token<T>,
  options: { lazy: true; optional: true },
): () => T | undefined;
function unifiedInject<T>(
  token: Token<T>,
  options: { lazy: true; multi: true; optional: true },
): () => T[] | undefined;
/** @throws {ZeltLifecycleStateError} */
function unifiedInject<T>(
  token: Token<T>,
  options?: { multi?: boolean; optional?: boolean; lazy?: boolean },
): unknown {
  if (options === undefined && isClassToken(token)) {
    const container = needleInject(Container);
    return resolve(container, token as new (...args: never[]) => object);
  }
  return needleInject(token, options as never);
}

export { unifiedInject as inject };
