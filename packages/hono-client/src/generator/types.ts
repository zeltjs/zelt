export type RouteInfo = {
  readonly method: string;
  readonly path: string;
  readonly fullPath: string;
  readonly methodName: string;
};

export type ControllerRouteInfo = {
  readonly basePath: string;
  readonly sourceFile: string | undefined;
  readonly name: string;
  readonly routes: readonly RouteInfo[];
};

export type HttpMetadata = {
  readonly controllers: readonly ControllerRouteInfo[];
};

export type GenerateOptions = {
  readonly distDir: string;
};

export type HttpAppLike = {
  getMetadata: () => HttpMetadata;
};
