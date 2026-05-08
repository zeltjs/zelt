import { inject } from '@needle-di/core';

import type { ConfigClass } from './types';
import { findConfigToken } from './token';

export const injectConfig = <T extends object>(configClass: ConfigClass<T>): T => {
  const actualConfig = findConfigToken(configClass);
  if (!actualConfig) {
    throw new Error(`Config class "${configClass.name}" is not decorated with @Config`);
  }
  return inject<T>(actualConfig);
};
