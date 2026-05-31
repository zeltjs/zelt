import type {
  ConfiguredFeature,
  FeatureApp,
  HttpCapabilities,
  ReadyApp,
} from '@zeltjs/core';

import { ElectronEnvAdaptor } from './electron-env.adaptor';

export type ElectronAppOptions = {
  readonly warmup?: boolean;
};

export type ElectronApp = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
  readonly fetch: (request: Request) => Promise<Response>;
  readonly shutdown: () => Promise<void>;
};

export const onElectron = async <const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options: ElectronAppOptions = {},
): Promise<ElectronApp> => {
  const readyApp = await app.ready({
    fallbackConfigs: [ElectronEnvAdaptor],
    warmup: options.warmup ?? true,
  });

  const httpCaps = (
    readyApp as ReadyApp<readonly ConfiguredFeature[]> & { http: HttpCapabilities }
  ).http;

  return {
    get: readyApp.get,
    fetch: httpCaps.fetch,
    shutdown: readyApp.shutdown,
  };
};
