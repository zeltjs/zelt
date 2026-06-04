import type { ServerType } from '@hono/node-server';
import { serve } from '@hono/node-server';
import type {
  CommandCapabilities,
  ConfiguredFeature,
  FeatureApp,
  HttpCapabilities,
  ReadyApp,
  SchedulerCapabilities,
} from '@zeltjs/core';
import { unsafeGetNamespacedCallable } from '@zeltjs/unsafe-type-lib';

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

type NodeAppBase = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
  readonly args: readonly string[];
  readonly shutdown: () => Promise<void>;
};

type EnvironmentNodeAppPart = {
  readonly args: readonly string[];
  readonly shutdown: () => Promise<void>;
};

type HttpNodeAppPart = {
  readonly listen: (portOrOptions?: number | ListenOptions) => Promise<ServerHandle>;
};

export type HttpNodeApp = NodeAppBase & { readonly http: HttpCapabilities } & HttpNodeAppPart;

export type CommandNodeApp = NodeAppBase & { readonly commands: CommandCapabilities };

export type SchedulerNodeAppPart = { readonly schedulers: SchedulerCapabilities };

export type NodeApp = (ReadyApp<readonly ConfiguredFeature[]> & EnvironmentNodeAppPart) &
  Partial<HttpNodeAppPart>;

type FeatureKeys<F extends readonly ConfiguredFeature[]> = F[number]['key'];

type WithFeature<
  F extends readonly ConfiguredFeature[],
  TKey extends string,
  TPart extends object,
> = TKey extends FeatureKeys<F> ? TPart : unknown;

type NodeAppForFeatures<F extends readonly ConfiguredFeature[]> = ReadyApp<F> &
  EnvironmentNodeAppPart &
  (string extends FeatureKeys<F>
    ? Partial<HttpNodeAppPart>
    : WithFeature<F, 'http', HttpNodeAppPart>);

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
  readyApp: ReadyApp<readonly ConfiguredFeature[]>,
  shutdown: () => Promise<void>,
  args: readonly string[],
): NodeApp => {
  const fetch = unsafeGetNamespacedCallable<HttpCapabilities['fetch']>(readyApp, 'http', 'fetch');
  const base: ReadyApp<readonly ConfiguredFeature[]> & EnvironmentNodeAppPart = {
    ...readyApp,
    args,
    shutdown,
  };

  if (typeof fetch !== 'function') return base;
  return { ...base, listen: createListenForHttp(fetch, shutdown) };
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
  const readyApp = await app.ready({
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
