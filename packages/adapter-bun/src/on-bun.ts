import type {
  CommandCapabilities,
  ConfiguredFeature,
  ExecResult,
  FeatureApp,
  HttpCapabilities,
  ReadyApp,
} from '@zeltjs/core';

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
  readonly args: readonly string[];
};

export type HttpBunApp = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
} & BunAppBase & {
    readonly serve: (options?: ServeOptions) => ServerHandle;
    readonly shutdown: () => Promise<void>;
  };

export type CommandBunApp = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
} & BunAppBase & {
    readonly execCommand: (argv: readonly string[]) => Promise<ExecResult>;
    readonly shutdown: () => Promise<void>;
  };

export type FullBunApp = HttpBunApp & CommandBunApp;

export type BunApp = HttpBunApp | CommandBunApp | FullBunApp;

type BunAppFor<F extends readonly ConfiguredFeature[]> =
  ReadyApp<F> extends { http: unknown; commands: unknown }
    ? FullBunApp
    : ReadyApp<F> extends { http: unknown }
      ? HttpBunApp
      : ReadyApp<F> extends { commands: unknown }
        ? CommandBunApp
        : BunApp;

type Stderr = { write: (s: string) => void };

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

const getStderr = (): Stderr => globalThis.process.stderr;

const getArgs = (): readonly string[] => Bun.argv.slice(2);

type AppCapabilities = {
  fetch?: ((request: Request) => Promise<Response>) | undefined;
  execCommand?: ((argv: readonly string[]) => Promise<ExecResult>) | undefined;
};

type Resolver = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
};

const extractCapabilities = (
  readyApp: ReadyApp<readonly ConfiguredFeature[]>,
): AppCapabilities => ({
  fetch:
    'http' in readyApp
      ? (readyApp as ReadyApp<readonly ConfiguredFeature[]> & { http: HttpCapabilities }).http.fetch
      : undefined,
  execCommand:
    'commands' in readyApp
      ? (
          readyApp as ReadyApp<readonly ConfiguredFeature[]> & {
            commands: CommandCapabilities;
          }
        ).commands.execCommand
      : undefined,
});

type BuildResult = {
  httpResult: HttpBunApp | undefined;
  commandResult: CommandBunApp | undefined;
};

const buildHttpBunApp = (
  caps: AppCapabilities,
  resolver: Resolver,
  shutdown: () => Promise<void>,
  args: readonly string[],
): HttpBunApp | undefined => {
  if (typeof caps.fetch !== 'function') return undefined;
  return { ...resolver, args, serve: createServeForHttp(caps.fetch, shutdown), shutdown };
};

const buildCommandBunApp = (
  caps: AppCapabilities,
  resolver: Resolver,
  shutdown: () => Promise<void>,
  stderr: Stderr,
  args: readonly string[],
): CommandBunApp | undefined => {
  if (typeof caps.execCommand !== 'function') return undefined;

  const coreExecCommand = caps.execCommand;
  const execCommand = async (argv: readonly string[]): Promise<ExecResult> => {
    const result = await coreExecCommand(argv);
    if (result.exitCode === 1) {
      stderr.write(`${result.reason.message}\n`);
    }
    return result;
  };

  return { ...resolver, args, execCommand, shutdown };
};

const buildBunApps = (
  caps: AppCapabilities,
  resolver: Resolver,
  shutdown: () => Promise<void>,
  stderr: Stderr,
  args: readonly string[],
): BuildResult => ({
  httpResult: buildHttpBunApp(caps, resolver, shutdown, args),
  commandResult: buildCommandBunApp(caps, resolver, shutdown, stderr, args),
});

const mergeBunApps = (
  result: BuildResult,
  resolver: Resolver,
  shutdown: () => Promise<void>,
  args: readonly string[],
): BunApp => {
  const { httpResult, commandResult } = result;
  if (httpResult && commandResult) {
    const fullApp: FullBunApp = { ...httpResult, execCommand: commandResult.execCommand };
    return fullApp;
  }
  if (httpResult) return httpResult;
  if (commandResult) return commandResult;
  return {
    ...resolver,
    args,
    shutdown,
    serve: () => ({ address: { port: 0, hostname: '' }, shutdown }),
  };
};

/** @throws {ZeltLifecycleStateError} */
export const onBun = async <const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options: BunAppOptions = {},
): Promise<BunAppFor<F>> => {
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

  const caps = extractCapabilities(readyApp);
  const stderr = getStderr();
  const args = getArgs();
  const resolver: Resolver = { get: readyApp.get };
  const result = buildBunApps(caps, resolver, shutdown, stderr, args);

  return mergeBunApps(result, resolver, shutdown, args) as BunAppFor<F>;
};
