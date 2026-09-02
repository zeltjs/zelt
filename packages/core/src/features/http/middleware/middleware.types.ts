import type { Context, Env, Input, MiddlewareHandler } from 'hono';

export type HonoMiddleware = MiddlewareHandler<Env, string, Input>;

// The [void] check must stay `void`: it detects the "provides no value" default
// of Next<T = void>, and `undefined` is a different type here — a middleware may
// legitimately provide `undefined` as a value via Next<undefined>.
// biome-ignore lint/suspicious/noConfusingVoidType: void vs undefined is the point of this check; biome's unsafe fix to `undefined` breaks Next resolution
export type Next<T = void> = [T] extends [void] ? () => Promise<void> : (value: T) => Promise<void>;

type MaybePromise<T> = T | Promise<T>;

type MiddlewareResult = MaybePromise<Response | undefined | undefined>;

export type MiddlewareInstance<TOptions = undefined> = [TOptions] extends [undefined]
  ? {
      use(next: Next): MiddlewareResult;
    }
  : {
      use(next: Next, options: TOptions): MiddlewareResult;
    };

export type MiddlewareClass<TOptions = undefined> = new (
  ...args: never[]
) => MiddlewareInstance<TOptions>;

export type RequestContext = Context<Env, string, Input>;

export type MiddlewareEntry<TOptions = unknown> = {
  readonly middleware: MiddlewareClass<TOptions>;
  readonly options: TOptions;
};

export type MiddlewareInput = MiddlewareClass | MiddlewareEntry<unknown>;

export type MiddlewareIdentifier = new (...args: never[]) => object;

export type ErrorHandlerClass = new (...args: never[]) => ErrorHandlerInstance;

export type ErrorHandlerInstance = {
  onError(error: Error, c: RequestContext): Response | Promise<Response | undefined> | undefined;
};
