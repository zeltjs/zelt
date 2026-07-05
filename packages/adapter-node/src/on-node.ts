import type {
  ConfigClass,
  ConfiguredFeature,
  FeatureApp,
  FeatureReadyCapabilities,
  RuntimeApp,
} from '@zeltjs/core';
import { HttpFeature } from '@zeltjs/core';

import type { ListenOptions, ServerHandle } from './listen.lib';
import { createListenForHttp } from './listen.lib';
import { NodeCliConfig } from './node-cli.config';
import { ProcessEnvAdaptor } from './process-env.adaptor';

export type { ServerHandle } from './listen.lib';

export type NodeAppOptions = {
  readonly configs?: readonly ConfigClass<object>[];
  readonly warmup?: boolean;
};

export type { ExecResult } from '@zeltjs/core';

type EnvironmentNodeAppPart = {
  readonly args: readonly string[];
  readonly shutdown: () => Promise<void>;
};

type HttpNodeAppPart = {
  readonly listen: (portOrOptions?: number | ListenOptions) => Promise<ServerHandle>;
};

type NodeFeatureCapabilities<TFeature extends ConfiguredFeature> =
  FeatureReadyCapabilities<TFeature> &
    (TFeature extends HttpFeature<string> ? HttpNodeAppPart : unknown);

type NodeNamespacedCapabilities<F extends readonly ConfiguredFeature[]> = {
  readonly [TFeature in F[number] as TFeature['key']]: NodeFeatureCapabilities<TFeature>;
};

export type NodeApp = RuntimeApp<readonly ConfiguredFeature[]> & EnvironmentNodeAppPart;

type NodeAppForFeatures<F extends readonly ConfiguredFeature[]> = RuntimeApp<F> &
  EnvironmentNodeAppPart &
  NodeNamespacedCapabilities<F>;

const getArgs = (): readonly string[] => globalThis.process.argv.slice(2);

const createNodeApp = (
  readyApp: RuntimeApp<readonly ConfiguredFeature[]>,
  shutdown: () => Promise<void>,
  args: readonly string[],
): NodeApp => {
  const base: RuntimeApp<readonly ConfiguredFeature[]> & EnvironmentNodeAppPart = {
    ...readyApp,
    args,
    shutdown,
  };

  const nodeApp: NodeApp = { ...base };

  for (const entry of readyApp.getFeatureEntries(HttpFeature)) {
    Object.defineProperty(nodeApp, entry.key, {
      value: {
        ...entry.capabilities,
        listen: createListenForHttp(entry.capabilities.fetch, (callback) =>
          entry.feature.registerShutdown(callback),
        ),
      },
      configurable: true,
      enumerable: true,
    });
  }

  return nodeApp;
};

export function onNode<const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options?: NodeAppOptions,
): Promise<NodeAppForFeatures<F>>;

/** @throws {ZeltLifecycleStateError} */
export async function onNode<const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options: NodeAppOptions = {},
): Promise<NodeApp> {
  const readyApp = await app.createRuntime({
    ...(options.configs === undefined ? {} : { configs: options.configs }),
    fallbackConfigs: [NodeCliConfig, ProcessEnvAdaptor],
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

  return createNodeApp(readyApp, shutdown, args);
}
