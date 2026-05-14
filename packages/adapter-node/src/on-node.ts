import type { ServerType } from '@hono/node-server';
import { serve } from '@hono/node-server';
import type {
  CommandApp,
  CommandClass,
  HttpApp,
  ReadyOptions,
  ReadyResult,
  SchedulerApp,
} from '@zeltjs/core';

import { NodeCliConfig } from './cli.config';
import { ProcessEnvConfig } from './process-env.config';

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

export type ExecResult = {
  readonly exitCode: 0 | 1;
};

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
    readonly execCommand: (argv: string[]) => Promise<ExecResult>;
    readonly shutdown: () => Promise<void>;
  };

export type SchedulerNodeAppPart = {
  readonly startScheduler: () => Promise<void>;
  readonly stopScheduler: () => Promise<void>;
};

export type FullNodeApp = HttpNodeApp & CommandNodeApp;

export type NodeApp = HttpNodeApp | CommandNodeApp | FullNodeApp;

type Stderr = { write: (s: string) => void };

const successResult: ExecResult = { exitCode: 0 };
const failureResult: ExecResult = { exitCode: 1 };

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

/** @throws {ZeltLifecycleStateError} */
const runCommand = (
  CommandClass: CommandClass,
  get: <T extends object>(cls: new (...args: never[]) => T) => T,
): Promise<ExecResult> => {
  const instance = get(CommandClass);
  return Promise.resolve()
    .then(() => instance.run())
    .then(() => successResult)
    .catch(() => failureResult);
};

/** @throws {ZeltLifecycleStateError} */
const createExecForCommands = (
  hasCommand: (name: string) => boolean,
  getCommands: () => ReadonlyMap<string, CommandClass>,
  get: <T extends object>(cls: new (...args: never[]) => T) => T,
  stderr: Stderr,
): ((argv: string[]) => Promise<ExecResult>) => {
  return async (argv: string[]): Promise<ExecResult> => {
    const commandName = argv[0];
    if (!commandName) {
      stderr.write('No command specified\n');
      return failureResult;
    }

    if (!hasCommand(commandName)) {
      stderr.write(`Command not found: ${commandName}\n`);
      return failureResult;
    }

    const commandMap = getCommands();
    const CommandClass = commandMap.get(commandName);
    if (!CommandClass) {
      return failureResult;
    }

    return runCommand(CommandClass, get);
  };
};

const getStderr = (): Stderr => globalThis.process.stderr;

const getArgs = (): readonly string[] => globalThis.process.argv.slice(2);

type AppCapabilities = {
  fetch?: (request: Request) => Promise<Response>;
  hasCommand?: (name: string) => boolean;
  getCommands?: () => ReadonlyMap<string, CommandClass>;
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

/** @throws {ZeltLifecycleStateError} */
const buildCommandNodeApp = (
  caps: AppCapabilities,
  resolver: ReadyResult,
  shutdown: () => Promise<void>,
  stderr: Stderr,
  args: readonly string[],
): CommandNodeApp | undefined => {
  if (typeof caps.hasCommand !== 'function' || typeof caps.getCommands !== 'function')
    return undefined;
  return {
    ...resolver,
    args,
    execCommand: createExecForCommands(caps.hasCommand, caps.getCommands, resolver.get, stderr),
    shutdown,
  };
};

const buildSchedulerPart = (caps: AppCapabilities): SchedulerNodeAppPart | undefined => {
  if (typeof caps.startScheduler !== 'function' || typeof caps.stopScheduler !== 'function')
    return undefined;
  return {
    startScheduler: caps.startScheduler,
    stopScheduler: caps.stopScheduler,
  };
};

/** @throws {ZeltLifecycleStateError} */
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
  app.addFallbackConfig(ProcessEnvConfig);

  const readyOptions: ReadyOptions = { warmup: options.warmup ?? true };
  const resolver = await app.ready(readyOptions);

  const caps = extractCapabilities(app);
  const stderr = getStderr();
  const args = getArgs();
  const result = buildNodeApps(caps, resolver, app.shutdown, stderr, args);

  return mergeNodeApps(result, resolver, app.shutdown, args);
}
