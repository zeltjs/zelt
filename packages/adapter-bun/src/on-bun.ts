import type {
  CommandFeature,
  ConfigClass,
  ConfiguredFeature,
  ContextMode,
  FeatureApp,
  HttpFeature,
  ReservedAppProperties,
  RuntimeApp,
  ZeltPrebuilt,
} from '@zeltjs/core';
import { LoggerService } from '@zeltjs/core';
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

type EnvironmentBunAppPart = ReservedAppProperties<{
  readonly args: readonly string[];
}>;

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
  const logger = await readyApp.get(LoggerService);

  const gracefulShutdown = (): void => {
    void readyApp.shutdown().catch((error: unknown) => {
      logger.error('Bun application shutdown failed', {
        error: Bun.inspect(error, { depth: Infinity }),
      });
    });
  };
  readyApp.registerShutdown(
    () => {
      cliConfig.offSignal('SIGINT', gracefulShutdown);
      cliConfig.offSignal('SIGTERM', gracefulShutdown);
    },
    { phase: 'after' },
  );

  cliConfig.onSignal('SIGINT', gracefulShutdown);
  cliConfig.onSignal('SIGTERM', gracefulShutdown);

  const args = getArgs();

  return { ...readyApp, args };
}
