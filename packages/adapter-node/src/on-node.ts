import { inspect } from 'node:util';
import type {
  ConfigClass,
  ConfiguredFeature,
  ContextMode,
  FeatureApp,
  ReservedAppProperties,
  RuntimeApp,
  ZeltPrebuilt,
} from '@zeltjs/core';
import { LoggerService } from '@zeltjs/core';
import { enableAsyncContext } from '@zeltjs/core/async-context';

import { NodeCliConfig } from './node-cli.config';
import { NodeHttpServerAdaptor } from './node-http-server.adaptor';
import { ProcessEnvAdaptor } from './process-env.adaptor';

export type { ServerHandle } from './listen.lib';

export type NodeAppOptions = {
  /** Set to false when the host manages SIGINT/SIGTERM and shutdown ordering. */
  readonly signals?: boolean;
  readonly contextMode?: ContextMode;
  readonly configs?: readonly ConfigClass<object>[];
  readonly warmup?: boolean;
  readonly prebuilt?: ZeltPrebuilt;
};

export type { ExecResult } from '@zeltjs/core';

type EnvironmentNodeAppPart = ReservedAppProperties<{
  readonly args: readonly string[];
}>;

type NodeAppForFeatures<F extends readonly ConfiguredFeature[]> = RuntimeApp<F> &
  EnvironmentNodeAppPart;

const getArgs = (): readonly string[] => globalThis.process.argv.slice(2);

/** @throws {ZeltLifecycleStateError | TypeError} */
export async function onNode<const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options: NodeAppOptions = {},
): Promise<NodeAppForFeatures<F>> {
  enableAsyncContext();
  const readyApp = await app.createRuntime({
    ...(options.contextMode === undefined ? {} : { contextMode: options.contextMode }),
    ...(options.configs === undefined ? {} : { configs: options.configs }),
    ...(options.prebuilt === undefined ? {} : { prebuilt: options.prebuilt }),
    fallbackConfigs: [NodeCliConfig, ProcessEnvAdaptor, NodeHttpServerAdaptor],
    warmup: options.warmup ?? true,
  });

  if (options.signals !== false) {
    const cliConfig = await readyApp.get(NodeCliConfig);
    const logger = await readyApp.get(LoggerService);

    const gracefulShutdown = (): void => {
      void readyApp.shutdown().catch((error: unknown) => {
        logger.error('Node application shutdown failed', {
          error: inspect(error, { depth: null }),
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
  }

  const args = getArgs();

  return { ...readyApp, args };
}
