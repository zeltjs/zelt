import type { ConfigClass, ConfiguredFeature, FeatureApp, RuntimeApp } from '@zeltjs/core';

import { getTestDefaults } from './global-config.lib';
import { registerShutdown } from './shutdown-registry.lib';

type AnyConfigClass = ConfigClass<object>;

type OnTestOptions = {
  readonly configs?: readonly AnyConfigClass[];
};

export const onTest = async <const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options: OnTestOptions = {},
): Promise<RuntimeApp<F>> => {
  const defaults = getTestDefaults();
  const allConfigs = [...defaults.configs, ...(options.configs ?? [])];

  const readyApp = await app.createRuntime({ configs: allConfigs });
  registerShutdown(readyApp.shutdown.bind(readyApp));

  return readyApp;
};
