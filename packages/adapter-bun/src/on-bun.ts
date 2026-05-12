import type { CommandApp, CommandClass, HttpApp, ReadyOptions, ReadyResult } from '@zeltjs/core';

import { BunEnvConfig } from './bun-env.config';

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

export type ExecResult = {
  readonly exitCode: 0 | 1;
};

type BunAppBase = {
  readonly args: readonly string[];
};

export type HttpBunApp = ReadyResult &
  BunAppBase & {
    readonly serve: (options?: ServeOptions) => ServerHandle;
    readonly shutdown: () => Promise<void>;
  };

export type CommandBunApp = ReadyResult &
  BunAppBase & {
    readonly execCommand: (argv: string[]) => Promise<ExecResult>;
    readonly shutdown: () => Promise<void>;
  };

export type FullBunApp = HttpBunApp & CommandBunApp;

export type BunApp = HttpBunApp | CommandBunApp | FullBunApp;

type Stderr = { write: (s: string) => void };

const successResult: ExecResult = { exitCode: 0 };
const failureResult: ExecResult = { exitCode: 1 };

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

const getArgs = (): readonly string[] => Bun.argv.slice(2);

type AppCapabilities = {
  fetch?: (request: Request) => Promise<Response>;
  hasCommand?: (name: string) => boolean;
  getCommands?: () => ReadonlyMap<string, CommandClass>;
};

const extractCapabilities = (app: HttpApp | CommandApp | (HttpApp & CommandApp)): AppCapabilities =>
  app;

type BuildResult = {
  httpResult: HttpBunApp | undefined;
  commandResult: CommandBunApp | undefined;
};

const buildHttpBunApp = (
  caps: AppCapabilities,
  resolver: ReadyResult,
  shutdown: () => Promise<void>,
  args: readonly string[],
): HttpBunApp | undefined => {
  if (typeof caps.fetch !== 'function') return undefined;
  return { ...resolver, args, serve: createServeForHttp(caps.fetch, shutdown), shutdown };
};

const buildCommandBunApp = (
  caps: AppCapabilities,
  resolver: ReadyResult,
  shutdown: () => Promise<void>,
  stderr: Stderr,
  args: readonly string[],
): CommandBunApp | undefined => {
  if (typeof caps.hasCommand !== 'function' || typeof caps.getCommands !== 'function')
    return undefined;
  return {
    ...resolver,
    args,
    execCommand: createExecForCommands(caps.hasCommand, caps.getCommands, resolver.get, stderr),
    shutdown,
  };
};

const buildBunApps = (
  caps: AppCapabilities,
  resolver: ReadyResult,
  shutdown: () => Promise<void>,
  stderr: Stderr,
  args: readonly string[],
): BuildResult => ({
  httpResult: buildHttpBunApp(caps, resolver, shutdown, args),
  commandResult: buildCommandBunApp(caps, resolver, shutdown, stderr, args),
});

const mergeBunApps = (
  result: BuildResult,
  resolver: ReadyResult,
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

export function onBun(app: HttpApp & CommandApp, options?: BunAppOptions): Promise<FullBunApp>;
export function onBun(app: HttpApp, options?: BunAppOptions): Promise<HttpBunApp>;
export function onBun(app: CommandApp, options?: BunAppOptions): Promise<CommandBunApp>;
export async function onBun(
  app: HttpApp | CommandApp | (HttpApp & CommandApp),
  options: BunAppOptions = {},
): Promise<BunApp> {
  app.addFallbackConfig(BunEnvConfig);

  const readyOptions: ReadyOptions = { warmup: options.warmup ?? true };
  const resolver = await app.ready(readyOptions);

  const caps = extractCapabilities(app);
  const stderr = getStderr();
  const args = getArgs();
  const result = buildBunApps(caps, resolver, app.shutdown, stderr, args);

  return mergeBunApps(result, resolver, app.shutdown, args);
}
