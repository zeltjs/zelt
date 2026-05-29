export { configureTestDefaults, getTestDefaults } from './global-config.lib';
export { onTest, type TestableApp } from './on-test';
export { shutdownAll } from './shutdown-registry.lib';
export {
  type CreateTestTargetOptions,
  createTestTarget,
  type Override,
  type TestTargetResult,
} from './test-target.lib';
