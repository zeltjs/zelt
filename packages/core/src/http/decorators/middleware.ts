import { injectable } from '@needle-di/core';

type AnyClass = new (...args: never[]) => object;

export const Middleware = <T extends AnyClass>(target: T): T => {
  injectable<T>()(target);
  return target;
};
