import type {
  CreateTestTargetOptions,
  TestTargetResult,
} from '@zeltjs/core/internal-bridge/testing';
import { createTestTargetBase } from '@zeltjs/core/internal-bridge/testing';

import { getTestDefaults } from './global-config';
import { registerShutdown } from './shutdown-registry';

export type {
  CreateTestTargetOptions,
  TestTargetResult,
} from '@zeltjs/core/internal-bridge/testing';

type AnyConstructor = new (...args: never[]) => unknown;

const mergeGlobalDefaults = (configs: readonly AnyConstructor[]): AnyConstructor[] => {
  const defaults = getTestDefaults();
  return [...defaults.configs, ...configs];
};

/** @throws {ZeltLifecycleStateError} */
export const createTestTarget = async <T extends object>(
  targetClass: new (...args: never[]) => T,
  options: CreateTestTargetOptions = {},
): Promise<TestTargetResult<T>> => {
  const mergedConfigs = mergeGlobalDefaults(options.configs ?? []);
  const result = await createTestTargetBase(targetClass, {
    ...options,
    configs: mergedConfigs,
  });
  registerShutdown(result.shutdown);
  return result;
};
