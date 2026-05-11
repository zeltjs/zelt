import { injectable } from '@needle-di/core';

import { registerConfigClass } from './token';

type AnyConstructor = new (...args: never[]) => unknown;

export const Config = (target: AnyConstructor): void => {
  registerConfigClass(target);
  injectable()(target);
};
