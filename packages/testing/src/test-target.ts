import { createTestTargetBase } from '@zeltjs/core';
import type { CreateTestTargetOptions, TestTargetResult } from '@zeltjs/core';
import { afterAll } from 'vitest';

export type { CreateTestTargetOptions, TestTargetResult } from '@zeltjs/core';

export const createTestTarget = async <T extends object>(
  targetClass: new (...args: never[]) => T,
  options: CreateTestTargetOptions = {},
): Promise<TestTargetResult<T>> => {
  const result = await createTestTargetBase(targetClass, options);
  afterAll(result.shutdown);
  return result;
};
