import type { ConfiguredFeature, HttpCapabilities, ReadyApp, ReadyOptions } from '@zeltjs/core';

import { ElectronEnvAdaptor } from './electron-env.adaptor';

export type ElectronAppOptions = {
  readonly warmup?: boolean;
};

type HttpReadyApp = ReadyApp<readonly ConfiguredFeature[]> & { readonly http: HttpCapabilities };

type HttpApp = {
  readonly ready: (options?: ReadyOptions) => Promise<HttpReadyApp>;
};

export type ElectronApp = {
  readonly get: HttpReadyApp['get'];
  readonly fetch: (request: Request) => Promise<Response>;
  readonly shutdown: () => Promise<void>;
};

export const onElectron = async (
  app: HttpApp,
  options: ElectronAppOptions = {},
): Promise<ElectronApp> => {
  const readyApp = await app.ready({
    fallbackConfigs: [ElectronEnvAdaptor],
    warmup: options.warmup ?? true,
  });

  return {
    get: readyApp.get,
    fetch: readyApp.http.fetch,
    shutdown: readyApp.shutdown,
  };
};
