import type { ConfigClass } from '@zeltjs/core';
import { createApp } from '@zeltjs/core';
import { override } from '@zeltjs/core/internal-bridge/testing';

import { getTestDefaults } from './global-config.lib';
import { registerShutdown } from './shutdown-registry.lib';

type AnyConfigClass = ConfigClass<object>;
type AnyClass = new (...args: never[]) => unknown;

export type Override<T = unknown> = {
  readonly provide: AnyClass & (new (...args: never[]) => T);
  readonly useValue: T;
};

export type CreateTestTargetOptions = {
  readonly configs?: readonly AnyConfigClass[];
  readonly overrides?: readonly Override[];
};

export type TestTargetResult<T> = {
  readonly target: T;
  readonly get: <U extends object>(cls: new (...args: never[]) => U) => Promise<U>;
  readonly shutdown: () => Promise<void>;
};

const mergeGlobalDefaults = (configs: readonly AnyConfigClass[]): AnyConfigClass[] => {
  const defaults = getTestDefaults();
  return [...defaults.configs, ...configs];
};

/**
 * @throws {ZeltAppConfigurationError}
 * @throws {AggregateError}
 * @throws {ZeltLifecycleStateError}
 * @throws {ZeltInternalError}
 * @throws {ZeltReadyFailedError}
 */
export const createTestTarget = async <T extends object>(
  targetClass: new (...args: never[]) => T,
  options: CreateTestTargetOptions = {},
): Promise<TestTargetResult<T>> => {
  const mergedConfigs = mergeGlobalDefaults(options.configs ?? []);

  const app = createApp([], { configs: mergedConfigs });
  const readyApp = await app.createRuntime();

  if (options.overrides?.length) {
    override(readyApp, options.overrides);
  }

  registerShutdown(readyApp.shutdown.bind(readyApp));

  return {
    target: await readyApp.get(targetClass),
    get: readyApp.get,
    shutdown: readyApp.shutdown.bind(readyApp),
  };
};
