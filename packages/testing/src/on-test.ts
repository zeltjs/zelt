import type { App, ConfigClass, ReadyResult } from '@zeltjs/core';

import { getTestDefaults } from './global-config.lib';
import { registerShutdown } from './shutdown-registry.lib';

type AnyConfigClass = ConfigClass<object>;

type OnTestOptions = {
  readonly configs?: readonly AnyConfigClass[];
};

export type TestableApp<T extends App> = T & Pick<ReadyResult, 'get'>;

const applyOverrides = (app: App, configs: readonly AnyConfigClass[]): void => {
  for (const configClass of configs) {
    app.overrideConfig(configClass);
  }
};

export const onTest = async <T extends App>(
  app: T,
  options: OnTestOptions = {},
): Promise<TestableApp<T>> => {
  const defaults = getTestDefaults();
  applyOverrides(app, defaults.configs);
  applyOverrides(app, options.configs ?? []);

  const { get } = await app.ready();
  registerShutdown(app.shutdown.bind(app));

  return { ...app, get };
};
