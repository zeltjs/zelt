import type { ErrorHandlerClass, MiddlewareInput } from './middleware/middleware.types';

export type ControllerClass = new (...args: never[]) => object;

export type HttpChildOptions = {
  readonly path: string;
  readonly controllers?: readonly ControllerClass[];
  readonly middlewares?: readonly MiddlewareInput[];
  readonly errorHandlers?: readonly ErrorHandlerClass[];
  readonly children?: readonly HttpChildOptions[];
};

export type HttpOptions = {
  readonly controllers: readonly ControllerClass[];
  readonly middlewares?: readonly MiddlewareInput[];
  readonly errorHandlers?: readonly ErrorHandlerClass[];
  readonly children?: readonly HttpChildOptions[];
};
