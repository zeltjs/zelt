import type { HttpApp, ConfigClass } from '@zeltjs/core';

import { getTestDefaults } from './global-config';
import { registerShutdown } from './shutdown-registry';

type AnyConfigClass = ConfigClass<object>;

type OnTestOptions = {
  readonly configs?: readonly AnyConfigClass[];
};

type TestApp = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
  readonly shutdown: () => Promise<void>;
};

const applyOverrides = (app: HttpApp, configs: readonly AnyConfigClass[]): void => {
  for (const configClass of configs) {
    app.overrideConfig(configClass);
  }
};

export const onTest = async (app: HttpApp, options: OnTestOptions = {}): Promise<TestApp> => {
  const defaults = getTestDefaults();
  applyOverrides(app, defaults.configs);
  applyOverrides(app, options.configs ?? []);

  await app.ready();
  registerShutdown(app.shutdown.bind(app));

  return {
    fetch: app.fetch.bind(app),
    request: app.request.bind(app),
    shutdown: app.shutdown.bind(app),
  };
};
