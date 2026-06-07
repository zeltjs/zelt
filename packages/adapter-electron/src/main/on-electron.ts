import type {
  ConfiguredFeature,
  CreateRuntimeOptions,
  HttpCapabilities,
  RuntimeApp,
} from '@zeltjs/core';

import { ElectronApp } from './electron-app';
import { ElectronEnvAdaptor } from './electron-env.adaptor';
import { setupIpcBridge } from './ipc-bridge';

export type ElectronAppOptions = {
  readonly warmup?: boolean;
  readonly ipcChannel?: string;
};

type HttpRuntimeApp = RuntimeApp<readonly ConfiguredFeature[]> & {
  readonly http: HttpCapabilities;
};

type HttpApp = {
  readonly createRuntime: (options?: CreateRuntimeOptions) => Promise<HttpRuntimeApp>;
};

export type OnElectronApp = {
  readonly get: HttpRuntimeApp['get'];
  readonly fetch: (request: Request) => Promise<Response>;
  readonly shutdown: () => Promise<void>;
};

const DEFAULT_IPC_CHANNEL = 'http://zelt-ipc';

export const onElectron = async (
  app: HttpApp,
  options: ElectronAppOptions = {},
): Promise<OnElectronApp> => {
  const readyApp = await app.createRuntime({
    fallbackConfigs: [ElectronEnvAdaptor],
    warmup: options.warmup ?? true,
  });

  const electronApp = await readyApp.get(ElectronApp);
  const channel = options.ipcChannel ?? DEFAULT_IPC_CHANNEL;

  const removeIpcHandler = setupIpcBridge(electronApp.ready.ipcMain, readyApp.http.fetch, channel);

  return {
    get: readyApp.get,
    fetch: readyApp.http.fetch,
    shutdown: async () => {
      removeIpcHandler();
      await readyApp.shutdown();
    },
  };
};
