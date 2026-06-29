export type RouteInfo = {
  readonly method: string;
  readonly path: string;
  readonly fullPath: string;
  readonly methodName: string;
};

export type ControllerClass = new (...args: never[]) => object;

export type ControllerRouteInfo = {
  readonly basePath: string;
  readonly name: string;
  readonly routes: readonly RouteInfo[];
};

export type HttpMetadata = {
  readonly controllers: readonly ControllerRouteInfo[];
};

export type StandardGenerateOptions = {
  readonly distDir: string;
  portable?: false;
};

export type PortableGenerateOptions = {
  readonly distDir: string;
  portable: true;
  readonly tsconfig: string;
  readonly projectRoot: string;
};

export type GenerateOptions = StandardGenerateOptions | PortableGenerateOptions;

export type HttpAppLike = {
  getMetadata: () => HttpMetadata;
  getControllers: () => readonly ControllerClass[];
};
