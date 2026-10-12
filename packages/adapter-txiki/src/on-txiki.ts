import type {
  ConfigClass,
  ConfiguredFeature,
  CreateRuntimeOptions,
  FeatureApp,
  FeatureReadyCapabilities,
  RuntimeApp,
  ZeltPrebuilt,
} from '@zeltjs/core';
import { HttpFeature, LoggerService } from '@zeltjs/core';
import { prepareTxikiRequest } from './prepare-request.lib';
import { TxikiEnvAdaptor } from './txiki-env.adaptor';

export type TxikiServeOptions = {
  readonly port?: number;
  readonly hostname?: string;
};

export type TxikiServerHandle = {
  readonly address: { readonly port: number; readonly hostname: string };
  readonly shutdown: () => Promise<void>;
};

export type TxikiAppOptions = {
  readonly configs?: readonly ConfigClass<object>[];
  readonly warmup?: boolean;
  readonly prebuilt?: ZeltPrebuilt;
  readonly signals?: boolean;
};

type HttpTxikiCapabilities = {
  readonly serve: (options?: TxikiServeOptions) => TxikiServerHandle;
};

type TxikiFeatureCapabilities<T extends ConfiguredFeature> = FeatureReadyCapabilities<T> &
  (T extends HttpFeature<string> ? HttpTxikiCapabilities : unknown);

export type TxikiApp<F extends readonly ConfiguredFeature[]> = RuntimeApp<F> & {
  readonly [T in F[number] as T['key']]: TxikiFeatureCapabilities<T>;
};

const createServe =
  (
    fetch: (request: Request) => Promise<Response>,
    registerShutdown: RuntimeApp<readonly ConfiguredFeature[]>['registerShutdown'],
  ): HttpTxikiCapabilities['serve'] =>
  (options = {}) => {
    const hostname = options.hostname ?? '127.0.0.1';
    let closeServer: (() => Promise<void>) | undefined;
    // Register before binding so a disposed runtime cannot open an unowned socket.
    const shutdown = registerShutdown(() => closeServer?.());
    try {
      const server = tjs.serve({ fetch, port: options.port ?? 3000, listenIp: hostname });
      closeServer = () => server.close();
      return { address: { port: server.port, hostname }, shutdown };
    } catch (error) {
      // No server was returned; remove the unused shutdown registration.
      void shutdown();
      throw error;
    }
  };

const attachHttpServers = (runtime: RuntimeApp<readonly ConfiguredFeature[]>): void => {
  for (const entry of runtime.getFeatureEntries(HttpFeature)) {
    const originalFetch = entry.capabilities.fetch;
    /** @throws {TypeError} */
    const fetch = async (request: Request): Promise<Response> =>
      originalFetch(await prepareTxikiRequest(request));
    /** @throws {TypeError} */
    const request: typeof entry.capabilities.request = (input, init) =>
      fetch(
        typeof input === 'string' ? new Request(new URL(input, 'http://localhost'), init) : input,
      );
    Object.defineProperties(entry.capabilities, {
      fetch: { value: fetch, enumerable: true, configurable: true },
      request: { value: request, enumerable: true, configurable: true },
    });
    Object.defineProperty(runtime, entry.key, {
      value: { ...entry.capabilities, serve: createServe(fetch, runtime.registerShutdown) },
      enumerable: true,
      configurable: true,
    });
  }
};

const attachSignals = (
  runtime: RuntimeApp<readonly ConfiguredFeature[]>,
  logger: LoggerService,
): void => {
  const shutdown = (): void => {
    void runtime.shutdown().catch((error: unknown) => {
      logger.error('txiki.js application shutdown failed', { error });
      tjs.exit(1);
    });
  };
  runtime.registerShutdown(() => {
    tjs.removeSignalListener('SIGINT', shutdown);
    tjs.removeSignalListener('SIGTERM', shutdown);
  });
  tjs.addSignalListener('SIGINT', shutdown);
  tjs.addSignalListener('SIGTERM', shutdown);
};

const runtimeOptions = (options: TxikiAppOptions): CreateRuntimeOptions => ({
  contextMode: 'sync',
  ...(options.configs === undefined ? {} : { configs: options.configs }),
  ...(options.prebuilt === undefined ? {} : { prebuilt: options.prebuilt }),
  fallbackConfigs: [TxikiEnvAdaptor],
  warmup: options.warmup ?? true,
});

export function onTxiki<const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options?: TxikiAppOptions,
): Promise<TxikiApp<F>>;

/** @throws {TypeError | AggregateError | ZeltLifecycleStateError} */
export async function onTxiki<const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options: TxikiAppOptions = {},
): Promise<RuntimeApp<readonly ConfiguredFeature[]>> {
  const runtime = await app.createRuntime(runtimeOptions(options));
  let shutdownPromise: Promise<void> | undefined;
  const originalShutdown = runtime.shutdown;
  const txikiRuntime = {
    ...runtime,
    shutdown: (): Promise<void> => (shutdownPromise ??= originalShutdown()),
  };
  try {
    attachHttpServers(txikiRuntime);
    if (options.signals ?? true) attachSignals(txikiRuntime, await runtime.get(LoggerService));
    return txikiRuntime;
  } catch (error) {
    try {
      await txikiRuntime.shutdown();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'txiki.js setup and cleanup failed');
    }
    throw error;
  }
}
