import type { Context, Env, Input, MiddlewareHandler } from 'hono';

export type FunctionMiddleware = MiddlewareHandler<Env, string, Input>;

export type MiddlewareClass<TOptions = void> = new (
  ...args: never[]
) => MiddlewareInstance<TOptions>;

export type RequestContext = Context<Env, string, Input>;
export type Next = () => Promise<void>;

export type MiddlewareInstance<TOptions = void> = {
  use(c: RequestContext, next: Next, options: TOptions): Promise<Response | undefined>;
};

export type MiddlewareInputWithOptions<TOptions = unknown> = [MiddlewareClass<TOptions>, TOptions];

export type MiddlewareInput = FunctionMiddleware | MiddlewareClass | MiddlewareInputWithOptions;

export type MiddlewareIdentifier = FunctionMiddleware | MiddlewareClass;

export type ErrorHandlerClass = new (...args: never[]) => ErrorHandlerInstance;

export type ErrorHandlerInstance = {
  onError(error: Error, c: RequestContext): Response | Promise<Response | undefined> | undefined;
};
