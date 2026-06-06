import type { ServerType } from '@hono/node-server';
import { serve } from '@hono/node-server';
import type { ConfiguredFeature, FeatureApp, RuntimeApp } from '@zeltjs/core';
import { hasFeature, HttpFeature } from '@zeltjs/core';

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

export type NodeApp = (RuntimeApp<readonly ConfiguredFeature[]> & EnvironmentNodeAppPart) &
  Partial<HttpNodeAppPart>;

type HasFeatureClass<
  F extends readonly ConfiguredFeature[],
  TFeature extends ConfiguredFeature,
> = Extract<F[number], TFeature> extends never ? false : true;

type WithFeatureClass<
  F extends readonly ConfiguredFeature[],
  TFeature extends ConfiguredFeature,
  TPart extends object,
> = HasFeatureClass<F, TFeature> extends true ? TPart : unknown;

type NodeAppForFeatures<F extends readonly ConfiguredFeature[]> = RuntimeApp<F> &
  EnvironmentNodeAppPart &
  (number extends F['length']
    ? Partial<HttpNodeAppPart>
    : WithFeatureClass<F, HttpFeature, HttpNodeAppPart>);

const createListenForHttp = (
  appFetch: (request: Request) => Promise<Response>,
  appShutdown: () => Promise<void>,
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

    const address = await serverReady;

    const shutdown = async (): Promise<void> => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      await appShutdown();
    };

    return { address, shutdown };
  };
};

const getArgs = (): readonly string[] => globalThis.process.argv.slice(2);

const createNodeApp = (
  readyApp: RuntimeApp<readonly ConfiguredFeature[]>,
  shutdown: () => Promise<void>,
  args: readonly string[],
): NodeApp => {
  const base: RuntimeApp<readonly ConfiguredFeature[]> & EnvironmentNodeAppPart = Object.assign(
    readyApp,
    {
      args,
      shutdown,
    },
  );

  if (!hasFeature(readyApp, HttpFeature)) return base;
  return Object.assign(base, { listen: createListenForHttp(readyApp.http.fetch, shutdown) });
};

export function onNode<const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options?: NodeAppOptions,
): Promise<NodeAppForFeatures<F>>;

/** @throws {ZeltLifecycleStateError} */
export async function onNode(
  app: FeatureApp<readonly ConfiguredFeature[]>,
  options: NodeAppOptions = {},
): Promise<NodeApp> {
  const readyApp = await app.createRuntime({
    fallbackConfigs: [NodeCliConfig, ProcessEnvAdaptor],
    warmup: options.warmup ?? true,
  });

  const cliConfig = await readyApp.get(NodeCliConfig);
  const runtimeShutdown = readyApp.shutdown;

  let shuttingDown = false;
  const detachSignals = (): void => {
    cliConfig.offSignal('SIGINT', gracefulShutdown);
    cliConfig.offSignal('SIGTERM', gracefulShutdown);
  };

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
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

  return createNodeApp(readyApp, shutdown, args);
}
