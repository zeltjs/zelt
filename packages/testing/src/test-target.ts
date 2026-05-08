import {
  createTestTargetBase,
  findRootConfigToken,
  toConfigClass,
  type ConfigClass,
} from '@zeltjs/core';
import type { CreateTestTargetOptions, TestTargetResult } from '@zeltjs/core';

import { getTestDefaults } from './global-config';
import { registerShutdown } from './shutdown-registry';

export type { CreateTestTargetOptions, TestTargetResult } from '@zeltjs/core';

type AnyConfigClass = ConfigClass<object>;

const applyGlobalDefaults = (configs: readonly AnyConfigClass[]): AnyConfigClass[] => {
  const defaults = getTestDefaults();
  const result: AnyConfigClass[] = [];

  for (const configClass of configs) {
    const token = findRootConfigToken(configClass);
    if (token && token === configClass) {
      const replacement = defaults.tokenMap.get(token);
      if (replacement) {
        result.push(replacement);
        continue;
      }
    }
    result.push(configClass);
  }

  return result;
};

export const createTestTarget = async <T extends object>(
  targetClass: new (...args: never[]) => T,
  options: CreateTestTargetOptions = {},
): Promise<TestTargetResult<T>> => {
  const inputConfigs: AnyConfigClass[] = (options.configs ?? []).map(toConfigClass);
  const mergedConfigs = applyGlobalDefaults(inputConfigs);
  const result = await createTestTargetBase(targetClass, {
    ...options,
    configs: mergedConfigs,
  });
  registerShutdown(result.shutdown);
  return result;
};
