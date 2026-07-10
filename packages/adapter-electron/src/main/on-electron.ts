import type { ListenOptions, ServerHandle } from '@zeltjs/adapter-node';
import { createListenForHttp } from '@zeltjs/adapter-node';
import type {
  ConfigClass,
  ConfiguredFeature,
  FeatureApp,
  FeatureReadyCapabilities,
  RuntimeApp,
} from '@zeltjs/core';
import { HTTP_FEATURE_KEY, HttpFeature } from '@zeltjs/core';

import { ElectronAdaptor } from './electron.adaptor';
import { ElectronEnvAdaptor } from './electron-env.adaptor';
import { setupIpcBridge } from './ipc-bridge';
import { ZeltElectronIpcFeatureNotFoundError } from './on-electron.exceptions';

export type { ServerHandle } from '@zeltjs/adapter-node';
export { ZeltElectronIpcFeatureNotFoundError } from './on-electron.exceptions';

type IpcChannel = `http://${string}` | `https://${string}`;

export type ElectronAppOptions<TIpcFeature extends string = string> = {
  readonly configs?: readonly ConfigClass<object>[];
  readonly warmup?: boolean;
  readonly ipcChannel?: IpcChannel;
  readonly ipcFeature?: TIpcFeature;
};

type HttpFeatureKeys<F extends readonly ConfiguredFeature[]> = Extract<
  F[number],
  HttpFeature<string>
>['key'];

type EnvironmentElectronAppPart = {
  readonly shutdown: () => Promise<void>;
};

type HttpElectronAppPart = {
  readonly listen: (portOrOptions?: number | ListenOptions) => Promise<ServerHandle>;
};

type ElectronFeatureCapabilities<TFeature extends ConfiguredFeature> =
  FeatureReadyCapabilities<TFeature> &
    (TFeature extends HttpFeature<string> ? HttpElectronAppPart : unknown);

type ElectronNamespacedCapabilities<F extends readonly ConfiguredFeature[]> = {
  readonly [TFeature in F[number] as TFeature['key']]: ElectronFeatureCapabilities<TFeature>;
};

export type OnElectronApp = RuntimeApp<readonly ConfiguredFeature[]> & EnvironmentElectronAppPart;

type ElectronAppForFeatures<F extends readonly ConfiguredFeature[]> = RuntimeApp<F> &
  EnvironmentElectronAppPart &
  ElectronNamespacedCapabilities<F>;

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

const createElectronApp = (
  readyApp: RuntimeApp<readonly ConfiguredFeature[]>,
  shutdown: () => Promise<void>,
): OnElectronApp => {
  const base: RuntimeApp<readonly ConfiguredFeature[]> & EnvironmentElectronAppPart = {
    ...readyApp,
    shutdown,
  };

  const electronApp: OnElectronApp = { ...base };

  for (const entry of readyApp.getFeatureEntries(HttpFeature)) {
    Object.defineProperty(electronApp, entry.key, {
      value: {
        ...entry.capabilities,
        listen: createListenForHttp(entry.capabilities.fetch, (callback) =>
          readyApp.registerShutdown(callback),
        ),
      },
      configurable: true,
      enumerable: true,
    });
  }

  return electronApp;
};

export function onElectron<const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options?: ElectronAppOptions<HttpFeatureKeys<F>>,
): Promise<ElectronAppForFeatures<F>>;

/** @throws {ZeltContextNotAvailableError | ZeltElectronIpcFeatureNotFoundError | AggregateError} */
export async function onElectron<const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options: ElectronAppOptions = {},
): Promise<OnElectronApp> {
  const readyApp = await app.createRuntime({
    ...(options.configs === undefined ? {} : { configs: options.configs }),
    fallbackConfigs: [ElectronEnvAdaptor],
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

      return createElectronApp(readyApp, shutdown);
    },
  );
}
