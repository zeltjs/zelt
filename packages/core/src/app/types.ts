import type { ConfigClass } from '../config';
import type { CommandClass } from '../command/types';

import type { HttpOptions } from './modules/http-module';
import type { SchedulerClass } from './modules/scheduler-module';

export type CreateAppOptions = {
  readonly http?: HttpOptions;
  readonly commands?: readonly CommandClass[];
  readonly schedulers?: readonly SchedulerClass[];
  readonly configs?: readonly ConfigClass<object>[];
};

export type ReadyOptions = {
  readonly warmup?: boolean;
};

export type ReadyResult = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => T;
  readonly getConfig: <T extends object>(configClass: ConfigClass<T>) => T;
};

type BaseApp = {
  readonly ready: (options?: ReadyOptions) => Promise<ReadyResult>;
  readonly shutdown: () => Promise<void>;
  readonly addFallbackConfig: (config: ConfigClass<object>) => void;
  readonly overrideConfig: (config: ConfigClass<object>) => void;
};

type HttpCapabilities = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
};

type CommandCapabilities = {
  readonly hasCommand: (name: string) => boolean;
  readonly getCommands: () => ReadonlyMap<string, CommandClass>;
};

export type App<TOptions extends CreateAppOptions = CreateAppOptions> = BaseApp &
  (TOptions['http'] extends HttpOptions ? HttpCapabilities : object) &
  (TOptions['commands'] extends readonly CommandClass[] ? CommandCapabilities : object);

export type HttpApp = App<{ http: HttpOptions }>;

export type CommandApp = App<{ commands: readonly CommandClass[] }>;
