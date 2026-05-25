import type { ServerType } from '@hono/node-server';
import { serve } from '@hono/node-server';
import type {
  CommandApp,
  ExecResult,
  HttpApp,
  ReadyOptions,
  ReadyResult,
  SchedulerApp,
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
  readonly args: readonly string[];
};

export type HttpNodeApp = ReadyResult &
  NodeAppBase & {
    readonly listen: (portOrOptions?: number | ListenOptions) => Promise<ServerHandle>;
    readonly shutdown: () => Promise<void>;
  };

export type CommandNodeApp = ReadyResult &
  NodeAppBase & {
    readonly execCommand: (argv: readonly string[]) => Promise<ExecResult>;
    readonly shutdown: () => Promise<void>;
  };

export type SchedulerNodeAppPart = {
  readonly startScheduler: () => Promise<void>;
  readonly stopScheduler: () => Promise<void>;
};

export type FullNodeApp = HttpNodeApp & CommandNodeApp;

export type NodeApp = HttpNodeApp | CommandNodeApp | FullNodeApp;

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
  fetch?: (request: Request) => Promise<Response>;
  execCommand?: (argv: readonly string[]) => Promise<ExecResult>;
  startScheduler?: () => Promise<void>;
  stopScheduler?: () => Promise<void>;
};

type AnyApp = HttpApp | CommandApp | SchedulerApp | (HttpApp & CommandApp & SchedulerApp);

const extractCapabilities = (app: AnyApp): AppCapabilities => app;

type BuildResult = {
  httpResult: HttpNodeApp | undefined;
  commandResult: CommandNodeApp | undefined;
  schedulerPart: SchedulerNodeAppPart | undefined;
};

const buildHttpNodeApp = (
  caps: AppCapabilities,
  resolver: ReadyResult,
  shutdown: () => Promise<void>,
  args: readonly string[],
): HttpNodeApp | undefined => {
  if (typeof caps.fetch !== 'function') return undefined;
  return { ...resolver, args, listen: createListenForHttp(caps.fetch, shutdown), shutdown };
};

const buildCommandNodeApp = (
  caps: AppCapabilities,
  resolver: ReadyResult,
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
  resolver: ReadyResult,
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
  resolver: ReadyResult,
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
export function onNode(
  app: HttpApp & CommandApp & SchedulerApp,
  options?: NodeAppOptions,
): Promise<FullNodeApp & SchedulerNodeAppPart>;
/** @throws {ZeltLifecycleStateError} */
export function onNode(
  app: HttpApp & SchedulerApp,
  options?: NodeAppOptions,
): Promise<HttpNodeApp & SchedulerNodeAppPart>;
/** @throws {ZeltLifecycleStateError} */
export function onNode(
  app: CommandApp & SchedulerApp,
  options?: NodeAppOptions,
): Promise<CommandNodeApp & SchedulerNodeAppPart>;
/** @throws {ZeltLifecycleStateError} */
export function onNode(app: HttpApp & CommandApp, options?: NodeAppOptions): Promise<FullNodeApp>;
/** @throws {ZeltLifecycleStateError} */
export function onNode(app: HttpApp, options?: NodeAppOptions): Promise<HttpNodeApp>;
/** @throws {ZeltLifecycleStateError} */
export function onNode(app: CommandApp, options?: NodeAppOptions): Promise<CommandNodeApp>;
/** @throws {ZeltLifecycleStateError} */
export async function onNode(app: AnyApp, options: NodeAppOptions = {}): Promise<NodeApp> {
  app.addFallbackConfig(NodeCliConfig);
  app.addFallbackConfig(ProcessEnvAdaptor);

  const readyOptions: ReadyOptions = { warmup: options.warmup ?? true };
  const resolver = await app.ready(readyOptions);

  const caps = extractCapabilities(app);
  const stderr = getStderr();
  const args = getArgs();
  const result = buildNodeApps(caps, resolver, app.shutdown, stderr, args);

  return mergeNodeApps(result, resolver, app.shutdown, args);
}
