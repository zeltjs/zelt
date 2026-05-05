import { inject } from '@needle-di/core';
import type { ConfigClass } from './types';

export const injectConfig = <T>(configClass: ConfigClass<T>): T => {
  const values = inject<T>(configClass.Token, { multi: true }) as T[];
  return values[0] as T;
};
