import type {
  CommandFeature,
  ConfigClass,
  ConfiguredFeature,
  ContextMode,
  FeatureApp,
  HttpFeature,
  RuntimeApp,
  ZeltPrebuilt,
} from '@zeltjs/core';
import { enableAsyncContext } from '@zeltjs/core/async-context';

import { BunCliConfig } from './bun-cli.config';
import { BunEnvAdaptor } from './bun-env.adaptor';
import { BunHttpServerAdaptor } from './bun-http-server.adaptor';

export type { HttpServerHandle as ServerHandle } from '@zeltjs/core';

export type BunAppOptions = {
  readonly contextMode?: ContextMode;
  readonly configs?: readonly ConfigClass<object>[];
  readonly warmup?: boolean;
  readonly prebuilt?: ZeltPrebuilt;
};

export type { ExecResult } from '@zeltjs/core';

type EnvironmentBunAppPart = {
  readonly args: readonly string[];
  readonly shutdown: () => Promise<void>;
};

export type HttpBunApp = RuntimeApp<readonly [HttpFeature<'http'>]> & EnvironmentBunAppPart;
export type CommandBunApp = RuntimeApp<readonly [CommandFeature]> & EnvironmentBunAppPart;
export type FullBunApp = RuntimeApp<readonly [HttpFeature<'http'>, CommandFeature]> &
  EnvironmentBunAppPart;

export type BunApp = RuntimeApp<readonly ConfiguredFeature[]> & EnvironmentBunAppPart;

type BunAppForFeatures<F extends readonly ConfiguredFeature[]> = RuntimeApp<F> &
  EnvironmentBunAppPart;

const getArgs = (): readonly string[] => Bun.argv.slice(2);

/** @throws {ZeltLifecycleStateError | TypeError} */
export async function onBun<const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options: BunAppOptions = {},
): Promise<BunAppForFeatures<F>> {
  enableAsyncContext();
  const readyApp = await app.createRuntime({
    ...(options.contextMode === undefined ? {} : { contextMode: options.contextMode }),
    ...(options.configs === undefined ? {} : { configs: options.configs }),
    ...(options.prebuilt === undefined ? {} : { prebuilt: options.prebuilt }),
    fallbackConfigs: [BunCliConfig, BunEnvAdaptor, BunHttpServerAdaptor],
    warmup: options.warmup ?? true,
  });

  const cliConfig = await readyApp.get(BunCliConfig);

  let shuttingDown = false;
  const detachSignals = (): void => {
    cliConfig.offSignal('SIGINT', gracefulShutdown);
    cliConfig.offSignal('SIGTERM', gracefulShutdown);
  };

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await readyApp.shutdown();
    } finally {
      detachSignals();
    }
  };

  const gracefulShutdown = (): void => {
    void shutdown().catch(() => {});
  };

  cliConfig.onSignal('SIGINT', gracefulShutdown);
  cliConfig.onSignal('SIGTERM', gracefulShutdown);

  const args = getArgs();

  return { ...readyApp, shutdown, args };
}
