import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import type { HttpApp, CommandApp, ReadyOptions, ReadyResult, CommandClass } from '@zeltjs/core';

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

export type HttpNodeApp = ReadyResult & {
  readonly listen: (portOrOptions?: number | ListenOptions) => Promise<ServerHandle>;
  readonly shutdown: () => Promise<void>;
};

export type CommandNodeApp = ReadyResult & {
  readonly exec: (argv: string[]) => Promise<ExecResult>;
  readonly shutdown: () => Promise<void>;
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

type AppCapabilities = {
  fetch?: (request: Request) => Promise<Response>;
  hasCommand?: (name: string) => boolean;
  getCommands?: () => ReadonlyMap<string, CommandClass>;
};

const extractCapabilities = (app: HttpApp | CommandApp | (HttpApp & CommandApp)): AppCapabilities =>
  app;

type BuildResult = {
  httpResult: HttpNodeApp | undefined;
  commandResult: CommandNodeApp | undefined;
};

const buildHttpNodeApp = (
  caps: AppCapabilities,
  resolver: ReadyResult,
  shutdown: () => Promise<void>,
): HttpNodeApp | undefined => {
  if (typeof caps.fetch !== 'function') return undefined;
  return { ...resolver, listen: createListenForHttp(caps.fetch, shutdown), shutdown };
};

const buildCommandNodeApp = (
  caps: AppCapabilities,
  resolver: ReadyResult,
  shutdown: () => Promise<void>,
  stderr: Stderr,
): CommandNodeApp | undefined => {
  if (typeof caps.hasCommand !== 'function' || typeof caps.getCommands !== 'function')
    return undefined;
  return {
    ...resolver,
    exec: createExecForCommands(caps.hasCommand, caps.getCommands, resolver.get, stderr),
    shutdown,
  };
};

const buildNodeApps = (
  caps: AppCapabilities,
  resolver: ReadyResult,
  shutdown: () => Promise<void>,
  stderr: Stderr,
): BuildResult => ({
  httpResult: buildHttpNodeApp(caps, resolver, shutdown),
  commandResult: buildCommandNodeApp(caps, resolver, shutdown, stderr),
});

const mergeNodeApps = (
  result: BuildResult,
  resolver: ReadyResult,
  shutdown: () => Promise<void>,
): NodeApp => {
  const { httpResult, commandResult } = result;
  if (httpResult && commandResult) {
    const fullApp: FullNodeApp = { ...httpResult, exec: commandResult.exec };
    return fullApp;
  }
  if (httpResult) return httpResult;
  if (commandResult) return commandResult;
  return { ...resolver, shutdown, listen: () => new Promise(() => {}) };
};

export function onNode(app: HttpApp & CommandApp, options?: NodeAppOptions): Promise<FullNodeApp>;
export function onNode(app: HttpApp, options?: NodeAppOptions): Promise<HttpNodeApp>;
export function onNode(app: CommandApp, options?: NodeAppOptions): Promise<CommandNodeApp>;
export async function onNode(
  app: HttpApp | CommandApp | (HttpApp & CommandApp),
  options: NodeAppOptions = {},
): Promise<NodeApp> {
  app.addFallbackConfig(NodeCliConfig);
  app.addFallbackConfig(ProcessEnvConfig);

  const readyOptions: ReadyOptions = { warmup: options.warmup ?? true };
  const resolver = await app.ready(readyOptions);

  const caps = extractCapabilities(app);
  const stderr = getStderr();
  const result = buildNodeApps(caps, resolver, app.shutdown, stderr);

  return mergeNodeApps(result, resolver, app.shutdown);
}
