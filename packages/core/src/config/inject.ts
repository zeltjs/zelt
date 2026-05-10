import { inject } from '@needle-di/core';

import type { ConfigClass } from './types';
import { findRootConfigToken } from './token';

export const injectConfig = <T extends object>(configClass: ConfigClass<T>): T => {
  const actualConfig = findRootConfigToken(configClass);
  if (!actualConfig) {
    throw new Error(`Config class "${configClass.name}" is not decorated with @Config`);
  }
  const configs: T[] = inject(actualConfig, { multi: true });
  const config = configs[0];
  if (!config) {
    throw new Error(`No provider found for config "${configClass.name}"`);
  }
  return config;
};
