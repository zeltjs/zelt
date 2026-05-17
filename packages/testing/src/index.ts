export type {
  CreateTestTargetOptions,
  TestTargetResult,
} from '@zeltjs/core/internal-bridge/testing';
export { configureTestDefaults, getTestDefaults } from './global-config';
export { onTest, type TestApp } from './on-test';
export { shutdownAll } from './shutdown-registry';
export { createTestTarget } from './test-target';
