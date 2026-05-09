import type { MiddlewareIdentifier, MiddlewareInput } from '../middleware/types';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type ControllerMetadata = {
  readonly basePath: string;
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

export const setControllerMiddlewareMetadata = (
  cls: object,
  middlewares: readonly MiddlewareInput[],
): void => {
  controllerMiddlewareStore.set(cls, { middlewares });
};

export const getControllerMiddlewareMetadata = (
  cls: object,
): ControllerMiddlewareMetadata | undefined => controllerMiddlewareStore.get(cls);

export const appendMethodMiddlewareMetadata = (
  cls: object,
  methodName: string | symbol,
  middlewares: readonly MiddlewareInput[],
): void => {
  const existing = methodMiddlewareStore.get(cls) ?? [];
  methodMiddlewareStore.set(cls, [...existing, { methodName, middlewares }]);
};

export const getMethodMiddlewareMetadata = (cls: object): readonly MethodMiddlewareMetadata[] =>
  methodMiddlewareStore.get(cls) ?? [];

export const appendSkipMiddlewareMetadata = (
  cls: object,
  methodName: string | symbol,
  skipped: readonly MiddlewareIdentifier[],
): void => {
  const existing = skipMiddlewareStore.get(cls) ?? [];
  skipMiddlewareStore.set(cls, [...existing, { methodName, skipped }]);
};

export const getSkipMiddlewareMetadata = (cls: object): readonly SkipMiddlewareMetadata[] =>
  skipMiddlewareStore.get(cls) ?? [];

export const setAuthorizedMetadata = (
  cls: object,
  methodName: string | symbol,
  roles: readonly string[],
): void => {
  const existing = authorizedStore.get(cls) ?? [];
  authorizedStore.set(cls, [...existing, { methodName, roles }]);
};

export const getAuthorizedMetadata = (
  cls: object,
  methodName: string | symbol,
): AuthorizedMetadata | undefined => {
  const all = authorizedStore.get(cls) ?? [];
  return all.find((m) => m.methodName === methodName);
};

export const appendPendingRouteMetadata = (pendingKey: object, meta: RouteMetadata): void => {
  const existing = pendingRouteStore.get(pendingKey) ?? [];
  pendingRouteStore.set(pendingKey, [...existing, meta]);
};

export const resolveRouteMetadata = (pendingKey: object, cls: object): void => {
  const pending = pendingRouteStore.get(pendingKey) ?? [];
  for (const meta of pending) {
    appendRouteMetadata(cls, meta);
  }
  pendingRouteStore.delete(pendingKey);
};

export const appendPendingMethodMiddlewareMetadata = (
  pendingKey: object,
  methodName: string | symbol,
  middlewares: readonly MiddlewareInput[],
): void => {
  const existing = pendingMethodMiddlewareStore.get(pendingKey) ?? [];
  pendingMethodMiddlewareStore.set(pendingKey, [...existing, { methodName, middlewares }]);
};

export const resolveMethodMiddlewareMetadata = (pendingKey: object, cls: object): void => {
  const pending = pendingMethodMiddlewareStore.get(pendingKey) ?? [];
  for (const { methodName, middlewares } of pending) {
    appendMethodMiddlewareMetadata(cls, methodName, middlewares);
  }
  pendingMethodMiddlewareStore.delete(pendingKey);
};

export const appendPendingSkipMiddlewareMetadata = (
  pendingKey: object,
  methodName: string | symbol,
  skipped: readonly MiddlewareIdentifier[],
): void => {
  const existing = pendingSkipMiddlewareStore.get(pendingKey) ?? [];
  pendingSkipMiddlewareStore.set(pendingKey, [...existing, { methodName, skipped }]);
};

export const resolveSkipMiddlewareMetadata = (pendingKey: object, cls: object): void => {
  const pending = pendingSkipMiddlewareStore.get(pendingKey) ?? [];
  for (const { methodName, skipped } of pending) {
    appendSkipMiddlewareMetadata(cls, methodName, skipped);
  }
  pendingSkipMiddlewareStore.delete(pendingKey);
};

export const appendPendingAuthorizedMetadata = (
  pendingKey: object,
  methodName: string | symbol,
  roles: readonly string[],
): void => {
  const existing = pendingAuthorizedStore.get(pendingKey) ?? [];
  pendingAuthorizedStore.set(pendingKey, [...existing, { methodName, roles }]);
};

export const resolveAuthorizedMetadata = (pendingKey: object, cls: object): void => {
  const pending = pendingAuthorizedStore.get(pendingKey) ?? [];
  for (const { methodName, roles } of pending) {
    setAuthorizedMetadata(cls, methodName, roles);
  }
  pendingAuthorizedStore.delete(pendingKey);
};
