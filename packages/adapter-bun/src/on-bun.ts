import type {
  CommandCapabilities,
  ConfiguredFeature,
  FeatureApp,
  HttpCapabilities,
  ReadyApp,
} from '@zeltjs/core';
import { unsafeGetNamespacedCallable } from '@zeltjs/unsafe-type-lib';

import { BunCliConfig } from './bun-cli.config';
import { BunEnvAdaptor } from './bun-env.adaptor';

type ServeOptions = {
  readonly port?: number;
  readonly hostname?: string;
};

export type ServerHandle = {
  readonly address: { port: number; hostname: string };
  readonly shutdown: () => Promise<void>;
};

export type BunAppOptions = {
  readonly warmup?: boolean;
};

export type { ExecResult } from '@zeltjs/core';

type BunAppBase = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
  readonly args: readonly string[];
  readonly shutdown: () => Promise<void>;
};

type EnvironmentBunAppPart = {
  readonly args: readonly string[];
  readonly shutdown: () => Promise<void>;
};

type HttpBunAppPart = {
  readonly serve: (options?: ServeOptions) => ServerHandle;
};

export type HttpBunApp = BunAppBase & { readonly http: HttpCapabilities } & HttpBunAppPart;

export type CommandBunApp = BunAppBase & { readonly commands: CommandCapabilities };

export type FullBunApp = HttpBunApp & CommandBunApp;

export type BunApp = (ReadyApp<readonly ConfiguredFeature[]> & EnvironmentBunAppPart) &
  Partial<HttpBunAppPart>;

type FeatureKeys<F extends readonly ConfiguredFeature[]> = F[number]['key'];

type WithFeature<
  F extends readonly ConfiguredFeature[],
  TKey extends string,
  TPart extends object,
> = TKey extends FeatureKeys<F> ? TPart : unknown;

type BunAppForFeatures<F extends readonly ConfiguredFeature[]> = ReadyApp<F> &
  EnvironmentBunAppPart &
  (string extends FeatureKeys<F>
    ? Partial<HttpBunAppPart>
    : WithFeature<F, 'http', HttpBunAppPart>);

const createServeForHttp = (
  appFetch: (request: Request) => Promise<Response>,
  appShutdown: () => Promise<void>,
): ((options?: ServeOptions) => ServerHandle) => {
  return (options?: ServeOptions): ServerHandle => {
    const port = options?.port ?? 3000;
    const hostname = options?.hostname ?? '0.0.0.0';

    const server = Bun.serve({
      fetch: appFetch,
      port,
      hostname,
    });

    const shutdown = async (): Promise<void> => {
      await server.stop();
      await appShutdown();
    };

    return {
      address: { port: server.port ?? port, hostname: server.hostname ?? hostname },
      shutdown,
    };
  };
};

const getArgs = (): readonly string[] => Bun.argv.slice(2);

const createBunApp = (
  readyApp: ReadyApp<readonly ConfiguredFeature[]>,
  shutdown: () => Promise<void>,
  args: readonly string[],
): BunApp => {
  const fetch = unsafeGetNamespacedCallable<HttpCapabilities['fetch']>(readyApp, 'http', 'fetch');
  const base: ReadyApp<readonly ConfiguredFeature[]> & EnvironmentBunAppPart = {
    ...readyApp,
    args,
    shutdown,
  };

  if (typeof fetch !== 'function') return base;
  return { ...base, serve: createServeForHttp(fetch, shutdown) };
};

export function onBun<const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options?: BunAppOptions,
): Promise<BunAppForFeatures<F>>;

/** @throws {ZeltLifecycleStateError} */
export async function onBun(
  app: FeatureApp<readonly ConfiguredFeature[]>,
  options: BunAppOptions = {},
): Promise<BunApp> {
  const readyApp = await app.ready({
    fallbackConfigs: [BunCliConfig, BunEnvAdaptor],
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

  return createBunApp(readyApp, shutdown, args);
}
