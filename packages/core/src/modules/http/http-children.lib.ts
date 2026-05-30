import type { ControllerClass, HttpChildOptions, HttpOptions } from './http.types';
import type { ControllerRouteInfo } from './routing';
import { collectControllerRouteInfo, joinPath } from './routing';

export const collectAllControllers = (options: HttpOptions): readonly ControllerClass[] => {
  const result: ControllerClass[] = [...options.controllers];
  const collectFromChildren = (children: readonly HttpChildOptions[]): void => {
    for (const child of children) {
      result.push(...(child.controllers ?? []));
      collectFromChildren(child.children ?? []);
    }
  };
  collectFromChildren(options.children ?? []);
  return result;
};

export const collectAllControllerMetadata = (
  options: HttpOptions,
  prefix = '',
): readonly ControllerRouteInfo[] => {
  const result: ControllerRouteInfo[] = options.controllers.map((cls) => {
    const info = collectControllerRouteInfo(cls);
    if (!prefix) return info;
    return {
      ...info,
      basePath: joinPath(prefix, info.basePath),
      routes: info.routes.map((r) => ({
        ...r,
        fullPath: joinPath(prefix, r.fullPath),
      })),
    };
  });

  for (const child of options.children ?? []) {
    const childPrefix = joinPath(prefix, child.path);
    const childAsOptions: HttpOptions = {
      controllers: child.controllers ?? [],
      ...(child.children ? { children: child.children } : {}),
    };
    result.push(...collectAllControllerMetadata(childAsOptions, childPrefix));
  }

  return result;
};
