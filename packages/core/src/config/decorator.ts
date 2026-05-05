import { injectable } from '@needle-di/core';

import type { ConfigClass } from './types';
import { findConfigToken } from './token';

export const Config = <T extends ConfigClass>(target: T): T => {
  if (!findConfigToken(target)) {
    throw new Error(
      `@Config class "${target.name}" must have static Token (or extend a class that has one)`,
    );
  }
  injectable()(target);
  return target;
};
