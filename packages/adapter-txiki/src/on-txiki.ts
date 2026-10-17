import type {
  ConfigClass,
  ConfiguredFeature,
  CreateRuntimeOptions,
  FeatureApp,
  RuntimeApp,
  ZeltPrebuilt,
} from '@zeltjs/core';
import { LoggerService } from '@zeltjs/core';
import { TxikiEnvAdaptor } from './txiki-env.adaptor';
import { TxikiHttpRequestConfig } from './txiki-http-request.config';
import { TxikiHttpServerAdaptor } from './txiki-http-server.adaptor';

export type TxikiAppOptions = {
  readonly configs?: readonly ConfigClass<object>[];
  readonly warmup?: boolean;
  readonly prebuilt?: ZeltPrebuilt;
  readonly signals?: boolean;
};

export type TxikiApp<F extends readonly ConfiguredFeature[]> = RuntimeApp<F>;

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
  fallbackConfigs: [TxikiEnvAdaptor, TxikiHttpRequestConfig, TxikiHttpServerAdaptor],
  warmup: options.warmup ?? true,
});

/** @throws {TypeError | AggregateError | ZeltLifecycleStateError} */
export async function onTxiki<const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options: TxikiAppOptions = {},
): Promise<TxikiApp<F>> {
  const runtime = await app.createRuntime(runtimeOptions(options));
  let shutdownPromise: Promise<void> | undefined;
  const originalShutdown = runtime.shutdown;
  const txikiRuntime = {
    ...runtime,
    shutdown: (): Promise<void> =>
      (shutdownPromise ??= originalShutdown().finally(() => {
        shutdownPromise = undefined;
      })),
  };
  try {
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
