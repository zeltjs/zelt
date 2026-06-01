import type { ServerType } from '@hono/node-server';
import { serve } from '@hono/node-server';
import type {
  CommandCapabilities,
  ConfiguredFeature,
  ExecResult,
  FeatureApp,
  HttpCapabilities,
  ReadyApp,
  SchedulerCapabilities,
} from '@zeltjs/core';

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

type HttpNodeAppPart = {
  readonly listen: (portOrOptions?: number | ListenOptions) => Promise<ServerHandle>;
};

export type HttpNodeApp = NodeAppBase & HttpNodeAppPart;

type CommandNodeAppPart = {
  readonly execCommand: (argv: readonly string[]) => Promise<ExecResult>;
};

export type CommandNodeApp = NodeAppBase & CommandNodeAppPart;

export type SchedulerNodeAppPart = {
  readonly startScheduler: () => Promise<void>;
  readonly stopScheduler: () => Promise<void>;
};

export type FullNodeApp = HttpNodeApp & CommandNodeApp;

export type NodeApp =
  | NodeAppBase
  | HttpNodeApp
  | CommandNodeApp
  | (NodeAppBase & SchedulerNodeAppPart)
  | FullNodeApp
  | (HttpNodeApp & SchedulerNodeAppPart)
  | (CommandNodeApp & SchedulerNodeAppPart)
  | (FullNodeApp & SchedulerNodeAppPart);

type FeatureKeys<F extends readonly ConfiguredFeature[]> = F[number]['key'];

type WithFeature<
  F extends readonly ConfiguredFeature[],
  TKey extends string,
  TPart extends object,
> = TKey extends FeatureKeys<F> ? TPart : unknown;

type NodeAppForFeatures<F extends readonly ConfiguredFeature[]> =
  string extends FeatureKeys<F>
    ? NodeApp
    : NodeAppBase &
        WithFeature<F, 'http', HttpNodeAppPart> &
        WithFeature<F, 'commands', CommandNodeAppPart> &
        WithFeature<F, 'schedulers', SchedulerNodeAppPart>;

type Stderr = { write: (s: string) => void };

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

const getStderr = (): Stderr => globalThis.process.stderr;

const getArgs = (): readonly string[] => globalThis.process.argv.slice(2);

type AppCapabilities = {
  fetch?: ((request: Request) => Promise<Response>) | undefined;
  execCommand?: ((argv: readonly string[]) => Promise<ExecResult>) | undefined;
  startScheduler?: (() => Promise<void>) | undefined;
  stopScheduler?: (() => Promise<void>) | undefined;
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
  startScheduler:
    'schedulers' in readyApp
      ? (
          readyApp as ReadyApp<readonly ConfiguredFeature[]> & {
            schedulers: SchedulerCapabilities;
          }
        ).schedulers.startScheduler
      : undefined,
  stopScheduler:
    'schedulers' in readyApp
      ? (
          readyApp as ReadyApp<readonly ConfiguredFeature[]> & {
            schedulers: SchedulerCapabilities;
          }
        ).schedulers.stopScheduler
      : undefined,
});

type BuildResult = {
  httpResult: HttpNodeApp | undefined;
  commandResult: CommandNodeApp | undefined;
  schedulerPart: SchedulerNodeAppPart | undefined;
};

const buildHttpNodeApp = (
  caps: AppCapabilities,
  resolver: Resolver,
  shutdown: () => Promise<void>,
  args: readonly string[],
): HttpNodeApp | undefined => {
  if (typeof caps.fetch !== 'function') return undefined;
  return { ...resolver, args, listen: createListenForHttp(caps.fetch, shutdown), shutdown };
};

const buildCommandNodeApp = (
  caps: AppCapabilities,
  resolver: Resolver,
  shutdown: () => Promise<void>,
  stderr: Stderr,
  args: readonly string[],
): CommandNodeApp | undefined => {
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

const buildSchedulerPart = (caps: AppCapabilities): SchedulerNodeAppPart | undefined => {
  if (typeof caps.startScheduler !== 'function' || typeof caps.stopScheduler !== 'function')
    return undefined;
  return {
    startScheduler: caps.startScheduler,
    stopScheduler: caps.stopScheduler,
  };
};

const buildNodeApps = (
  caps: AppCapabilities,
  resolver: Resolver,
  shutdown: () => Promise<void>,
  stderr: Stderr,
  args: readonly string[],
): BuildResult => ({
  httpResult: buildHttpNodeApp(caps, resolver, shutdown, args),
  commandResult: buildCommandNodeApp(caps, resolver, shutdown, stderr, args),
  schedulerPart: buildSchedulerPart(caps),
});

const mergeNodeApps = (
  result: BuildResult,
  resolver: Resolver,
  shutdown: () => Promise<void>,
  args: readonly string[],
): NodeApp => {
  const { httpResult, commandResult, schedulerPart } = result;
  const schedulerMethods = schedulerPart ?? {};

  if (httpResult && commandResult) {
    const fullApp: FullNodeApp = {
      ...httpResult,
      execCommand: commandResult.execCommand,
      ...schedulerMethods,
    };
    return fullApp;
  }
  if (httpResult) return { ...httpResult, ...schedulerMethods };
  if (commandResult) return { ...commandResult, ...schedulerMethods };
  return { ...resolver, args, shutdown, listen: () => new Promise(() => {}), ...schedulerMethods };
};

/** @throws {ZeltLifecycleStateError} */
export const onNode = async <const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options: NodeAppOptions = {},
): Promise<NodeAppForFeatures<F>> => {
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

  const caps = extractCapabilities(readyApp);
  const stderr = getStderr();
  const args = getArgs();
  const resolver: Resolver = { get: readyApp.get };
  const result = buildNodeApps(caps, resolver, shutdown, stderr, args);

  return mergeNodeApps(result, resolver, shutdown, args) as NodeAppForFeatures<F>;
};
