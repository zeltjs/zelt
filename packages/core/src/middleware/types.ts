import type { Context, Env, Input, MiddlewareHandler } from 'hono';

export type FunctionMiddleware = MiddlewareHandler<Env, string, Input>;

export type MiddlewareClass = new (...args: never[]) => MiddlewareInstance;

export type RequestContext = Context<Env, string, Input>;
export type Next = () => Promise<void>;

export type MiddlewareInstance = {
  use(c: RequestContext, next: Next): Promise<Response | undefined>;
};

export type MiddlewareInput = FunctionMiddleware | MiddlewareClass;

export type MiddlewareIdentifier = FunctionMiddleware | MiddlewareClass;

export type ErrorHandlerClass = new (...args: never[]) => ErrorHandlerInstance;

export type ErrorHandlerInstance = {
  onError(error: Error, c: RequestContext): Response | Promise<Response | undefined> | undefined;
};
