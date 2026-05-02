export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ControllerMetadata = {
  readonly basePath: string;
};

export type RouteMetadata = {
  readonly method: HttpMethod;
  readonly path: string;
  readonly methodName: string | symbol;
};

const controllerStore = new WeakMap<object, ControllerMetadata>();
const routeStore = new WeakMap<object, RouteMetadata[]>();

export const setControllerMetadata = (cls: object, meta: ControllerMetadata): void => {
  controllerStore.set(cls, meta);
};

export const getControllerMetadata = (cls: object): ControllerMetadata | undefined =>
  controllerStore.get(cls);

export const appendRouteMetadata = (cls: object, meta: RouteMetadata): void => {
  const existing = routeStore.get(cls) ?? [];
  const exists = existing.some(
    (r) => r.method === meta.method && r.path === meta.path && r.methodName === meta.methodName,
  );
  if (exists) return;
  routeStore.set(cls, [...existing, meta]);
};

export const getRouteMetadata = (cls: object): readonly RouteMetadata[] =>
  routeStore.get(cls) ?? [];
