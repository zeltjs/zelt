import type {
  ConfiguredFeature,
  CreateRuntimeOptions,
  HttpCapabilities,
  RuntimeApp,
} from '@zeltjs/core';

import { ElectronEnvAdaptor } from './electron-env.adaptor';

export type ElectronAppOptions = {
  readonly warmup?: boolean;
};

type HttpRuntimeApp = RuntimeApp<readonly ConfiguredFeature[]> & {
  readonly http: HttpCapabilities;
};

type HttpApp = {
  readonly createRuntime: (options?: CreateRuntimeOptions) => Promise<HttpRuntimeApp>;
};

export type ElectronApp = {
  readonly get: HttpRuntimeApp['get'];
  readonly fetch: (request: Request) => Promise<Response>;
  readonly shutdown: () => Promise<void>;
};

export const onElectron = async (
  app: HttpApp,
  options: ElectronAppOptions = {},
): Promise<ElectronApp> => {
  const readyApp = await app.createRuntime({
    fallbackConfigs: [ElectronEnvAdaptor],
    warmup: options.warmup ?? true,
  });

  return {
    get: readyApp.get,
    fetch: readyApp.http.fetch,
    shutdown: readyApp.shutdown,
  };
};
