import { injectable } from '@needle-di/core';

import { resolveClassArgs } from '../internal/decorator-context';

import { registerConfigToken } from './token';
import { toConfigClass } from './types';

export const Config = (...args: unknown[]): void => {
  const { cls } = resolveClassArgs(args);
  const target = toConfigClass(cls);
  registerConfigToken(target);
  injectable()(target);
};
