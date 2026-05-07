import { findConfigToken, type HttpApp, type ConfigClass } from '@zeltjs/core';
import { afterAll } from 'vitest';

import { getTestDefaults } from './global-config';

type AnyConstructor = new (...args: never[]) => unknown;
type AnyConfigClass = ConfigClass<object>;

type OnTestOptions = {
  readonly configs?: readonly AnyConstructor[];
};

type TestApp = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
  readonly shutdown: () => Promise<void>;
};

const tryReplaceConfig = (
  app: HttpApp,
  token: AnyConstructor,
  replacement: AnyConstructor,
): void => {
  try {
    app.replaceConfig(token as AnyConfigClass, replacement as AnyConfigClass);
  } catch {
    // Token not in app's configs - ignore
  }
};

export const onTest = async (app: HttpApp, options: OnTestOptions = {}): Promise<TestApp> => {
  const defaults = getTestDefaults();

  // Apply global config replacements first (lower priority)
  for (const [token, replacement] of defaults.tokenMap) {
    tryReplaceConfig(app, token, replacement);
  }

  // Apply inline config replacements (higher priority, overrides global)
  for (const configClass of options.configs ?? []) {
    const token = findConfigToken(configClass);
    if (token) {
      tryReplaceConfig(app, token, configClass);
    }
  }

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
