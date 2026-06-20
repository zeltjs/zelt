import type {
  CommandCapabilities,
  ConfiguredFeature,
  FeatureApp,
  FeatureReadyCapabilities,
  RuntimeApp,
} from '@zeltjs/core';
import { HttpFeature } from '@zeltjs/core';

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

type BunFeatureCapabilities<TFeature extends ConfiguredFeature> =
  FeatureReadyCapabilities<TFeature> &
    (TFeature extends HttpFeature<string> ? HttpBunAppPart : unknown);

type BunNamespacedCapabilities<F extends readonly ConfiguredFeature[]> = {
  readonly [TFeature in F[number] as TFeature['key']]: BunFeatureCapabilities<TFeature>;
};

export type HttpBunApp = BunAppBase &
  RuntimeApp<readonly [HttpFeature]> & {
    readonly http: RuntimeApp<readonly [HttpFeature]>['http'] & HttpBunAppPart;
  };

export type CommandBunApp = BunAppBase & { readonly commands: CommandCapabilities };

export type FullBunApp = HttpBunApp & CommandBunApp;

export type BunApp = RuntimeApp<readonly ConfiguredFeature[]> & EnvironmentBunAppPart;

type BunAppForFeatures<F extends readonly ConfiguredFeature[]> = RuntimeApp<F> &
  EnvironmentBunAppPart &
  BunNamespacedCapabilities<F>;

type BunServer = ReturnType<typeof Bun.serve>;

type ServerRegistry = {
  readonly add: (server: BunServer) => void;
  readonly close: (server: BunServer) => Promise<void>;
  readonly closeAll: () => Promise<void>;
};

const createServerRegistry = (): ServerRegistry => {
  const servers = new Set<BunServer>();

  const close = async (server: BunServer): Promise<void> => {
    if (!servers.delete(server)) return;
    await server.stop();
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

const createServeForHttp = (
  appFetch: (request: Request) => Promise<Response>,
  serverRegistry: ServerRegistry,
): ((options?: ServeOptions) => ServerHandle) => {
  return (options?: ServeOptions): ServerHandle => {
    const port = options?.port ?? 3000;
    const hostname = options?.hostname ?? '0.0.0.0';

    const server = Bun.serve({
      fetch: appFetch,
      port,
      hostname,
    });
    serverRegistry.add(server);

    const shutdown = async (): Promise<void> => {
      await serverRegistry.close(server);
    };

    return {
      address: { port: server.port ?? port, hostname: server.hostname ?? hostname },
      shutdown,
    };
  };
};

const getArgs = (): readonly string[] => Bun.argv.slice(2);

const createBunApp = (
  readyApp: RuntimeApp<readonly ConfiguredFeature[]>,
  shutdown: () => Promise<void>,
  args: readonly string[],
  serverRegistry: ServerRegistry,
): BunApp => {
  const base: RuntimeApp<readonly ConfiguredFeature[]> & EnvironmentBunAppPart = {
    ...readyApp,
    args,
    shutdown,
  };

  const bunApp: BunApp = { ...base };

  for (const entry of readyApp.getFeatureEntries(HttpFeature)) {
    Object.defineProperty(bunApp, entry.key, {
      value: {
        ...entry.capabilities,
        serve: createServeForHttp(entry.capabilities.fetch, serverRegistry),
      },
      configurable: true,
      enumerable: true,
    });
  }

  return bunApp;
};

export function onBun<const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options?: BunAppOptions,
): Promise<BunAppForFeatures<F>>;

/** @throws {ZeltLifecycleStateError} */
export async function onBun<const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options: BunAppOptions = {},
): Promise<BunApp> {
  const readyApp = await app.createRuntime({
    fallbackConfigs: [BunCliConfig, BunEnvAdaptor],
    warmup: options.warmup ?? true,
  });

  const cliConfig = await readyApp.get(BunCliConfig);
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

  return createBunApp(readyApp, shutdown, args, serverRegistry);
}
