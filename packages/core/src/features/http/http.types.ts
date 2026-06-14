import type { ServiceResolver } from '../../app';
import type { ErrorHandlerClass, MiddlewareInput } from './middleware/middleware.types';
import type { ControllerClass, ControllerRouteInfo } from './routing';

export type { ControllerClass } from './routing';

export type HttpMetadata = {
  readonly controllers: readonly ControllerRouteInfo[];
};

export type HttpStaticCapabilities = {
  readonly getControllers: () => readonly ControllerClass[];
  readonly getMetadata: () => HttpMetadata;
};

export type HttpMountableRouter = {
  readonly fetch: (request: Request) => Response | Promise<Response>;
};

export type HttpMountableCapabilities = {
  readonly router: HttpMountableRouter;
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
};

// Same shape as the generic Feature contract: a module returns a
// self-contained router (own path already applied) and parents merge it
// without passing anything down.
export type HttpMountableFeatureModule = {
  readonly path: string;
  readonly featureClasses: () => readonly ControllerClass[];
  readonly blueprint: () => HttpStaticCapabilities;
  readonly realize: (resolver: ServiceResolver) => Promise<HttpMountableCapabilities>;
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
