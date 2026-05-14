import type { MiddlewareIdentifier, MiddlewareInput } from '../middleware/types';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type ControllerMetadata = {
  readonly basePath: string;
  readonly sourceFile: string | undefined;
};

type RouteMetadata = {
  readonly method: HttpMethod;
  readonly path: string;
  readonly methodName: string | symbol;
};

type ControllerMiddlewareMetadata = {
  readonly middlewares: readonly MiddlewareInput[];
};

type MethodMiddlewareMetadata = {
  readonly methodName: string | symbol;
  readonly middlewares: readonly MiddlewareInput[];
};

type SkipMiddlewareMetadata = {
  readonly methodName: string | symbol;
  readonly skipped: readonly MiddlewareIdentifier[];
};

type AuthorizedMetadata = {
  readonly methodName: string | symbol;
  readonly roles: readonly string[];
};

export type RouteInfo = {
  readonly method: HttpMethod;
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

const controllerStore = new WeakMap<object, ControllerMetadata>();
const routeStore = new WeakMap<object, RouteMetadata[]>();
const controllerMiddlewareStore = new WeakMap<object, ControllerMiddlewareMetadata>();
const methodMiddlewareStore = new WeakMap<object, MethodMiddlewareMetadata[]>();
const skipMiddlewareStore = new WeakMap<object, SkipMiddlewareMetadata[]>();
const authorizedStore = new WeakMap<object, AuthorizedMetadata[]>();

const pendingRouteStore = new WeakMap<object, RouteMetadata[]>();
const pendingMethodMiddlewareStore = new WeakMap<object, MethodMiddlewareMetadata[]>();
const pendingSkipMiddlewareStore = new WeakMap<object, SkipMiddlewareMetadata[]>();
const pendingAuthorizedStore = new WeakMap<object, AuthorizedMetadata[]>();

export const setControllerMetadata = (cls: object, meta: ControllerMetadata): void => {
  controllerStore.set(cls, meta);
};

/** @throws {ZeltLifecycleStateError} */
export const getControllerMetadata = (cls: object): ControllerMetadata | undefined =>
  controllerStore.get(cls);

/** @throws {ZeltLifecycleStateError} */
export const appendRouteMetadata = (cls: object, meta: RouteMetadata): void => {
  const existing = routeStore.get(cls) ?? [];
  const exists = existing.some(
    (r) => r.method === meta.method && r.path === meta.path && r.methodName === meta.methodName,
  );
  if (exists) return;
  routeStore.set(cls, [...existing, meta]);
};

/** @throws {ZeltLifecycleStateError} */
export const getRouteMetadata = (cls: object): readonly RouteMetadata[] =>
  routeStore.get(cls) ?? [];

export const setControllerMiddlewareMetadata = (
  cls: object,
  middlewares: readonly MiddlewareInput[],
): void => {
  controllerMiddlewareStore.set(cls, { middlewares });
};

/** @throws {ZeltLifecycleStateError} */
export const getControllerMiddlewareMetadata = (
  cls: object,
): ControllerMiddlewareMetadata | undefined => controllerMiddlewareStore.get(cls);

/** @throws {ZeltLifecycleStateError} */
export const appendMethodMiddlewareMetadata = (
  cls: object,
  methodName: string | symbol,
  middlewares: readonly MiddlewareInput[],
): void => {
  const existing = methodMiddlewareStore.get(cls) ?? [];
  methodMiddlewareStore.set(cls, [...existing, { methodName, middlewares }]);
};

/** @throws {ZeltLifecycleStateError} */
export const getMethodMiddlewareMetadata = (cls: object): readonly MethodMiddlewareMetadata[] =>
  methodMiddlewareStore.get(cls) ?? [];

/** @throws {ZeltLifecycleStateError} */
export const appendSkipMiddlewareMetadata = (
  cls: object,
  methodName: string | symbol,
  skipped: readonly MiddlewareIdentifier[],
): void => {
  const existing = skipMiddlewareStore.get(cls) ?? [];
  skipMiddlewareStore.set(cls, [...existing, { methodName, skipped }]);
};

/** @throws {ZeltLifecycleStateError} */
export const getSkipMiddlewareMetadata = (cls: object): readonly SkipMiddlewareMetadata[] =>
  skipMiddlewareStore.get(cls) ?? [];

/** @throws {ZeltLifecycleStateError} */
export const setAuthorizedMetadata = (
  cls: object,
  methodName: string | symbol,
  roles: readonly string[],
): void => {
  const existing = authorizedStore.get(cls) ?? [];
  authorizedStore.set(cls, [...existing, { methodName, roles }]);
};

/** @throws {ZeltLifecycleStateError} */
export const getAuthorizedMetadata = (
  cls: object,
  methodName: string | symbol,
): AuthorizedMetadata | undefined => {
  const all = authorizedStore.get(cls) ?? [];
  return all.find((m) => m.methodName === methodName);
};

/** @throws {ZeltLifecycleStateError} */
export const appendPendingRouteMetadata = (pendingKey: object, meta: RouteMetadata): void => {
  const existing = pendingRouteStore.get(pendingKey) ?? [];
  pendingRouteStore.set(pendingKey, [...existing, meta]);
};

/** @throws {ZeltLifecycleStateError} */
export const resolveRouteMetadata = (pendingKey: object, cls: object): void => {
  const pending = pendingRouteStore.get(pendingKey) ?? [];
  for (const meta of pending) {
    appendRouteMetadata(cls, meta);
  }
  pendingRouteStore.delete(pendingKey);
};

/** @throws {ZeltLifecycleStateError} */
export const appendPendingMethodMiddlewareMetadata = (
  pendingKey: object,
  methodName: string | symbol,
  middlewares: readonly MiddlewareInput[],
): void => {
  const existing = pendingMethodMiddlewareStore.get(pendingKey) ?? [];
  pendingMethodMiddlewareStore.set(pendingKey, [...existing, { methodName, middlewares }]);
};

/** @throws {ZeltLifecycleStateError} */
export const resolveMethodMiddlewareMetadata = (pendingKey: object, cls: object): void => {
  const pending = pendingMethodMiddlewareStore.get(pendingKey) ?? [];
  for (const { methodName, middlewares } of pending) {
    appendMethodMiddlewareMetadata(cls, methodName, middlewares);
  }
  pendingMethodMiddlewareStore.delete(pendingKey);
};

/** @throws {ZeltLifecycleStateError} */
export const appendPendingSkipMiddlewareMetadata = (
  pendingKey: object,
  methodName: string | symbol,
  skipped: readonly MiddlewareIdentifier[],
): void => {
  const existing = pendingSkipMiddlewareStore.get(pendingKey) ?? [];
  pendingSkipMiddlewareStore.set(pendingKey, [...existing, { methodName, skipped }]);
};

/** @throws {ZeltLifecycleStateError} */
export const resolveSkipMiddlewareMetadata = (pendingKey: object, cls: object): void => {
  const pending = pendingSkipMiddlewareStore.get(pendingKey) ?? [];
  for (const { methodName, skipped } of pending) {
    appendSkipMiddlewareMetadata(cls, methodName, skipped);
  }
  pendingSkipMiddlewareStore.delete(pendingKey);
};

/** @throws {ZeltLifecycleStateError} */
export const appendPendingAuthorizedMetadata = (
  pendingKey: object,
  methodName: string | symbol,
  roles: readonly string[],
): void => {
  const existing = pendingAuthorizedStore.get(pendingKey) ?? [];
  pendingAuthorizedStore.set(pendingKey, [...existing, { methodName, roles }]);
};

/** @throws {ZeltLifecycleStateError} */
export const resolveAuthorizedMetadata = (pendingKey: object, cls: object): void => {
  const pending = pendingAuthorizedStore.get(pendingKey) ?? [];
  for (const { methodName, roles } of pending) {
    setAuthorizedMetadata(cls, methodName, roles);
  }
  pendingAuthorizedStore.delete(pendingKey);
};

const joinPath = (base: string, sub: string): string => {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedSub = sub.startsWith('/') ? sub : `/${sub}`;
  const joined = `${normalizedBase}${normalizedSub}`;
  return joined === '' ? '/' : joined;
};

export const collectControllerRouteInfo = (
  cls: new (...args: never[]) => object,
): ControllerRouteInfo => {
  const controllerMeta = controllerStore.get(cls);
  const basePath = controllerMeta?.basePath ?? '/';
  const routeMeta = routeStore.get(cls) ?? [];

  const routes = routeMeta.flatMap((r) =>
    typeof r.methodName === 'string'
      ? [
          {
            method: r.method,
            path: r.path,
            fullPath: joinPath(basePath, r.path),
            methodName: r.methodName,
          },
        ]
      : [],
  );

  return {
    basePath,
    sourceFile: controllerMeta?.sourceFile,
    name: cls.name,
    routes,
  };
};
