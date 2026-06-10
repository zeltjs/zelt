import type { Hono } from 'hono';

import type { ErrorHandlerClass, MiddlewareInput } from './middleware/middleware.types';

export type ControllerClass = new (...args: never[]) => object;

export type HttpChildRuntimeInitializerContext = {
  readonly path: string;
  readonly controllers: readonly ControllerClass[];
  readonly router: Hono;
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
};

export type HttpChildRuntimeInitializer = {
  readonly name: string;
  readonly initialize: (context: HttpChildRuntimeInitializerContext) => void | Promise<void>;
};

export type HttpChildOptions = {
  readonly path: string;
  readonly controllers?: readonly ControllerClass[];
  readonly middlewares?: readonly MiddlewareInput[];
  readonly errorHandlers?: readonly ErrorHandlerClass[];
  readonly children?: readonly HttpChildOptions[];
  readonly runtimeInitializers?: readonly HttpChildRuntimeInitializer[];
};

export type HttpOptions = {
  readonly controllers: readonly ControllerClass[];
  readonly middlewares?: readonly MiddlewareInput[];
  readonly errorHandlers?: readonly ErrorHandlerClass[];
  readonly children?: readonly HttpChildOptions[];
  readonly runtimeInitializers?: readonly HttpChildRuntimeInitializer[];
};
