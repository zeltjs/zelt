import type { ServerType } from '@hono/node-server';
import { serve } from '@hono/node-server';
import type {
  ConfiguredFeature,
  FeatureApp,
  FeatureReadyCapabilities,
  RuntimeApp,
} from '@zeltjs/core';
import { HttpFeature } from '@zeltjs/core';

import { NodeCliConfig } from './node-cli.config';
import { ProcessEnvAdaptor } from './process-env.adaptor';

type ListenOptions = {
  readonly port?: number;
  readonly hostname?: string;
};

export type ServerHandle = {
  readonly address: { port: number; address: string };
  readonly shutdown: () => Promise<void>;
};

export type NodeAppOptions = {
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

type ServerRegistry = {
  readonly add: (server: ServerType) => void;
  readonly close: (server: ServerType) => Promise<void>;
  readonly closeAll: () => Promise<void>;
};

const closeServer = (server: ServerType): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

const createServerRegistry = (): ServerRegistry => {
  const servers = new Set<ServerType>();

  const close = async (server: ServerType): Promise<void> => {
    if (!servers.delete(server)) return;
    await closeServer(server);
  };

  return {
    add: (server) => {
      servers.add(server);
    },
    close,
    closeAll: async () => {
      await Promise.all([...servers].map((server) => close(server)));
    },
  };
};

const createListenForHttp = (
  appFetch: (request: Request) => Promise<Response>,
  serverRegistry: ServerRegistry,
): ((portOrOptions?: number | ListenOptions) => Promise<ServerHandle>) => {
  return async (portOrOptions?: number | ListenOptions): Promise<ServerHandle> => {
    const listenOptions: ListenOptions =
      typeof portOrOptions === 'number' ? { port: portOrOptions } : (portOrOptions ?? {});

    const port = listenOptions.port ?? 3000;
    const hostname = listenOptions.hostname ?? '0.0.0.0';

    let server!: ServerType;
    const serverReady = new Promise<{ port: number; address: string }>((resolve) => {
      server = serve({ fetch: appFetch, port, hostname }, (info) =>
        resolve({ port: info.port, address: info.address }),
      );
    });
    serverRegistry.add(server);

    const address = await serverReady;

    const shutdown = async (): Promise<void> => {
      await serverRegistry.close(server);
    };

    return { address, shutdown };
  };
};

const getArgs = (): readonly string[] => globalThis.process.argv.slice(2);

const createNodeApp = (
  readyApp: RuntimeApp<readonly ConfiguredFeature[]>,
  shutdown: () => Promise<void>,
  args: readonly string[],
  serverRegistry: ServerRegistry,
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
        listen: createListenForHttp(entry.capabilities.fetch, serverRegistry),
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
    fallbackConfigs: [NodeCliConfig, ProcessEnvAdaptor],
    warmup: options.warmup ?? true,
  });

  const cliConfig = await readyApp.get(NodeCliConfig);
  const runtimeShutdown = readyApp.shutdown;
  const serverRegistry = createServerRegistry();

  let shuttingDown = false;
  const detachSignals = (): void => {
    cliConfig.offSignal('SIGINT', gracefulShutdown);
    cliConfig.offSignal('SIGTERM', gracefulShutdown);
  };

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await serverRegistry.closeAll();
      await runtimeShutdown();
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

  return createNodeApp(readyApp, shutdown, args, serverRegistry);
}
