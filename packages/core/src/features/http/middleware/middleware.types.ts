import type { Context, Env, Input, MiddlewareHandler } from 'hono';

export type HonoMiddleware = MiddlewareHandler<Env, string, Input>;

// The zero-arg branch must match `void` EXACTLY, not anything assignable to it:
// `[T] extends [void]` alone also captures T = undefined (undefined is
// assignable to void), which would silently turn Next<undefined> into a
// zero-arg function — but Next<undefined> is a legitimate "provides an
// explicit undefined" contract, distinguished at runtime via arguments.length.
// The double check ([T] extends [void] and [void] extends [T]) is only true
// for void itself.
// biome-ignore lint/suspicious/noConfusingVoidType: void vs undefined is the point of this check; biome's unsafe fix to `undefined` breaks Next resolution
export type Next<T = void> = [T] extends [void]
  ? [void] extends [T]
    ? () => Promise<void>
    : (value: T) => Promise<void>
  : (value: T) => Promise<void>;

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
