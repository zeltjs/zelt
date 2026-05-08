import { findRootConfigToken, type HttpApp, type ConfigClass } from '@zeltjs/core';
import { afterAll } from 'vitest';

import { getTestDefaults } from './global-config';

type AnyConfigClass = ConfigClass<object>;

type OnTestOptions = {
  readonly configs?: readonly AnyConfigClass[];
};

type TestApp = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
  readonly shutdown: () => Promise<void>;
};

const applyGlobalConfigs = (app: HttpApp): void => {
  const defaults = getTestDefaults();
  for (const [token, replacement] of defaults.tokenMap) {
    if (app.hasConfig(token)) {
      app.replaceConfig(token, replacement);
    }
  }
};

const applyInlineConfigs = (app: HttpApp, configs: readonly AnyConfigClass[]): void => {
  for (const configClass of configs) {
    const token = findRootConfigToken(configClass);
    if (token && app.hasConfig(token)) {
      app.replaceConfig(token, configClass);
    }
  }
};

export const onTest = async (app: HttpApp, options: OnTestOptions = {}): Promise<TestApp> => {
  applyGlobalConfigs(app);
  applyInlineConfigs(app, options.configs ?? []);

  await app.ready();

  afterAll(async () => {
    await app.shutdown();
  });

  return {
    fetch: app.fetch.bind(app),
    request: app.request.bind(app),
    shutdown: app.shutdown.bind(app),
  };
};
