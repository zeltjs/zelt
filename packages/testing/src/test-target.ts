import { createTestTargetBase, findRootConfigToken } from '@zeltjs/core';
import type { CreateTestTargetOptions, TestTargetResult } from '@zeltjs/core';

import { getTestDefaults } from './global-config';
import { registerShutdown } from './shutdown-registry';

export type { CreateTestTargetOptions, TestTargetResult } from '@zeltjs/core';

type AnyConstructor = new (...args: never[]) => unknown;

const applyGlobalDefaults = (configs: readonly AnyConstructor[]): AnyConstructor[] => {
  const defaults = getTestDefaults();
  const result: AnyConstructor[] = [];

  for (const configClass of configs) {
    const rootToken = findRootConfigToken(configClass);
    // If this config IS the root token (base class), check for global replacement
    if (rootToken && rootToken === configClass) {
      const replacement = defaults.tokenMap.get(rootToken);
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
  registerShutdown(result.shutdown);
  return result;
};
