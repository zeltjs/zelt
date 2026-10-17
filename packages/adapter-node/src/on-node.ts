import type {
  ConfigClass,
  ConfiguredFeature,
  ContextMode,
  FeatureApp,
  RuntimeApp,
  ZeltPrebuilt,
} from '@zeltjs/core';
import { enableAsyncContext } from '@zeltjs/core/async-context';

import { NodeCliConfig } from './node-cli.config';
import { NodeHttpServerAdaptor } from './node-http-server.adaptor';
import { ProcessEnvAdaptor } from './process-env.adaptor';

export type { ServerHandle } from './listen.lib';

export type NodeAppOptions = {
  readonly contextMode?: ContextMode;
  readonly configs?: readonly ConfigClass<object>[];
  readonly warmup?: boolean;
  readonly prebuilt?: ZeltPrebuilt;
};

export type { ExecResult } from '@zeltjs/core';

type EnvironmentNodeAppPart = {
  readonly args: readonly string[];
  readonly shutdown: () => Promise<void>;
};

export type NodeApp = RuntimeApp<readonly ConfiguredFeature[]> & EnvironmentNodeAppPart;

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

  const cliConfig = await readyApp.get(NodeCliConfig);

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
