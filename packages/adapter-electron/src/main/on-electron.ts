import { NodeHttpServerAdaptor } from '@zeltjs/adapter-node';
import type {
  ConfigClass,
  ConfiguredFeature,
  ContextMode,
  FeatureApp,
  RuntimeApp,
  ZeltPrebuilt,
} from '@zeltjs/core';
import { HTTP_FEATURE_KEY, HttpFeature } from '@zeltjs/core';
import { enableAsyncContext } from '@zeltjs/core/async-context';

import { ElectronAdaptor } from './electron.adaptor';
import { ElectronEnvAdaptor } from './electron-env.adaptor';
import { setupIpcBridge } from './ipc-bridge';
import { ZeltElectronIpcFeatureNotFoundError } from './on-electron.exceptions';

export type { ServerHandle } from '@zeltjs/adapter-node';
export { ZeltElectronIpcFeatureNotFoundError } from './on-electron.exceptions';

type IpcChannel = `http://${string}` | `https://${string}`;

export type ElectronAppOptions<TIpcFeature extends string = string> = {
  readonly contextMode?: ContextMode;
  readonly configs?: readonly ConfigClass<object>[];
  readonly warmup?: boolean;
  readonly prebuilt?: ZeltPrebuilt;
  readonly ipcChannel?: IpcChannel;
  readonly ipcFeature?: TIpcFeature;
};

type HttpFeatureKeys<F extends readonly ConfiguredFeature[]> = Extract<
  F[number],
  HttpFeature<string>
>['key'];

export type OnElectronApp = RuntimeApp<readonly ConfiguredFeature[]>;

const DEFAULT_IPC_CHANNEL = 'http://zelt-ipc';

// warmup already started feature-owned resources (e.g. DB connections); any setup failure
// after createRuntime() must tear them down via cleanup so they aren't left leaked.
/** @throws {AggregateError} */
const withCleanupOnError = async <T>(
  cleanup: () => Promise<void>,
  body: () => Promise<T>,
): Promise<T> => {
  try {
    return await body();
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'onElectron setup failed and runtime shutdown also failed',
      );
    }
    throw error;
  }
};

/** @throws {ZeltContextNotAvailableError | ZeltElectronIpcFeatureNotFoundError | AggregateError | TypeError} */
export async function onElectron<const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options: ElectronAppOptions<HttpFeatureKeys<F>> = {},
): Promise<RuntimeApp<F>> {
  enableAsyncContext();
  const readyApp = await app.createRuntime({
    ...(options.contextMode === undefined ? {} : { contextMode: options.contextMode }),
    ...(options.configs === undefined ? {} : { configs: options.configs }),
    ...(options.prebuilt === undefined ? {} : { prebuilt: options.prebuilt }),
    fallbackConfigs: [ElectronEnvAdaptor, NodeHttpServerAdaptor],
    warmup: options.warmup ?? true,
  });

  // declared outside the body so cleanup can remove the IPC handler even if a step
  // after setupIpcBridge (e.g. createElectronApp) throws before onElectron returns.
  let removeIpcHandler: (() => void) | undefined;

  return withCleanupOnError(
    async () => {
      removeIpcHandler?.();
      await readyApp.shutdown();
    },
    async () => {
      const ipcFeature = options.ipcFeature ?? HTTP_FEATURE_KEY;
      const ipcEntry = readyApp
        .getFeatureEntries(HttpFeature)
        .find((entry) => entry.key === ipcFeature);

      if (ipcEntry === undefined) {
        throw new ZeltElectronIpcFeatureNotFoundError({ ipcFeature });
      }

      const electronAdaptor = await readyApp.get(ElectronAdaptor);
      const channel = options.ipcChannel ?? DEFAULT_IPC_CHANNEL;

      removeIpcHandler = setupIpcBridge(
        electronAdaptor.ready.ipcMain,
        ipcEntry.capabilities.fetch,
        channel,
      );

      const shutdown = async (): Promise<void> => {
        removeIpcHandler?.();
        await readyApp.shutdown();
      };

      return { ...readyApp, shutdown };
    },
  );
}
