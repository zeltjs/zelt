import type { Hono } from 'hono';

import type { FeatureRuntime } from '../../app';
import type { ErrorHandlerClass, MiddlewareInput } from './middleware/middleware.types';
import type { ControllerRouteInfo } from './routing';

export type ControllerClass = new (...args: never[]) => object;

export type HttpMetadata = {
  readonly controllers: readonly ControllerRouteInfo[];
};

export type HttpStaticCapabilities = {
  readonly getControllers: () => readonly ControllerClass[];
  readonly getMetadata: () => HttpMetadata;
};

export type HttpMountContext = {
  readonly middlewares: readonly MiddlewareInput[];
  readonly errorHandlers: readonly ErrorHandlerClass[];
};

export type HttpMountableCapabilities = {
  readonly router: Hono;
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
};

export type HttpMountableFeatureModule = {
  readonly path: string;
  readonly featureClasses: () => readonly ControllerClass[];
  readonly staticCapabilities: () => HttpStaticCapabilities;
  readonly createCapabilities: (runtime: FeatureRuntime) => Promise<HttpMountableCapabilities>;
  readonly createHttpCapabilities?: (
    runtime: FeatureRuntime,
    context: HttpMountContext,
  ) => Promise<HttpMountableCapabilities>;
};

export type HttpModuleOptions = {
  readonly path?: string;
  readonly controllers?: readonly ControllerClass[];
  readonly middlewares?: readonly MiddlewareInput[];
  readonly errorHandlers?: readonly ErrorHandlerClass[];
  readonly children?: readonly HttpMountableFeatureModule[];
};

export type HttpCapabilities = Pick<HttpMountableCapabilities, 'fetch' | 'request'>;

export type HttpChildOptions = HttpModuleOptions;
export type HttpOptions = HttpModuleOptions;
