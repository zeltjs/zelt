import { createTestTargetBase, findConfigToken, type ConfigClass } from '@zeltjs/core';
import type { CreateTestTargetOptions, TestTargetResult } from '@zeltjs/core';
import { afterAll } from 'vitest';

import { getTestDefaults } from './global-config';

export type { CreateTestTargetOptions, TestTargetResult } from '@zeltjs/core';

type AnyConstructor = new (...args: never[]) => unknown;
type AnyConfigClass = ConfigClass<object>;

const isBaseConfig = (configClass: AnyConstructor, token: AnyConfigClass): boolean => {
  return token.Token === configClass;
};

const applyGlobalDefaults = (configs: readonly AnyConstructor[]): AnyConstructor[] => {
  const defaults = getTestDefaults();
  const result: AnyConstructor[] = [];

  for (const configClass of configs) {
    const token = findConfigToken(configClass);
    // If this config IS the token (base class), check for global replacement
    if (token && isBaseConfig(configClass, token)) {
      const replacement = defaults.tokenMap.get(token);
      if (replacement) {
        result.push(replacement);
        continue;
      }
    }
    // Otherwise keep the original (either no token, or inline override)
    result.push(configClass);
  }

  return result;
};

export const createTestTarget = async <T extends object>(
  targetClass: new (...args: never[]) => T,
  options: CreateTestTargetOptions = {},
): Promise<TestTargetResult<T>> => {
  const mergedConfigs = applyGlobalDefaults(options.configs ?? []);
  const result = await createTestTargetBase(targetClass, {
    ...options,
    configs: mergedConfigs,
  });
  afterAll(result.shutdown);
  return result;
};
