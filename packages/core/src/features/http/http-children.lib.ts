import type { ControllerClass, HttpMetadata } from './http.types';
import type { ControllerRouteInfo } from './routing';
import { collectControllerRouteInfo, joinPath } from './routing';

export const prefixControllerMetadata = (
  info: ControllerRouteInfo,
  prefix: string,
): ControllerRouteInfo => {
  if (prefix === '/' || prefix === '') return info;
  return {
    ...info,
    basePath: joinPath(prefix, info.basePath),
    routes: info.routes.map((route) => ({
      ...route,
      fullPath: joinPath(prefix, route.fullPath),
    })),
  };
};

export const prefixHttpMetadata = (metadata: HttpMetadata, prefix: string): HttpMetadata => ({
  controllers: metadata.controllers.map((controller) =>
    prefixControllerMetadata(controller, prefix),
  ),
});

export const collectOwnControllerMetadata = (
  controllers: readonly ControllerClass[],
  prefix: string,
): readonly ControllerRouteInfo[] =>
  controllers.map((controller) =>
    prefixControllerMetadata(collectControllerRouteInfo(controller), prefix),
  );
