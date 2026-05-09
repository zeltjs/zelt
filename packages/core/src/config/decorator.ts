import { injectable } from '@needle-di/core';

import { registerConfigToken } from './token';

type AnyConstructor = new (...args: never[]) => unknown;

export const Config = (target: AnyConstructor): void => {
  registerConfigToken(target);
  injectable()(target);
};
