import { getClassMetadata, getSourcePosition } from '@zeltjs/decorator-metadata/inspect';
import { match, P } from 'ts-pattern';

import type { MiddlewareIdentifier, MiddlewareInput } from '../middleware/types';

const FRAMEWORK_PATH_PATTERNS = [
  '/node_modules/',
  '/packages/decorator-metadata/',
  '/kernel/internal/',
] as const;

const isTestFile = (path: string): boolean => /\.(test|spec)\./.test(path);

const DECORATOR_FILES = ['/controller.ts', '/http-method.ts'] as const;

const isCoreDecoratorPath = (path: string): boolean => {
  if (!path.includes('/packages/core/src/modules/')) return false;
  if (path.includes('/decorators/')) return true;
  return DECORATOR_FILES.some((f) => path.endsWith(f));
};

const isCoreNonModulePath = (path: string): boolean =>
  path.includes('/packages/core/') && !path.includes('/modules/');

const isCoreFrameworkPath = (path: string): boolean => {
  const normalized = path.replace(/\\/g, '/');
  if (FRAMEWORK_PATH_PATTERNS.some((p) => normalized.includes(p))) return true;
  if (isTestFile(normalized)) return false;
  return isCoreDecoratorPath(normalized) || isCoreNonModulePath(normalized);
};

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

// One entry per `@UseMiddleware(...)` application. The arguments passed to a
// single application are kept together as a set — they are intentionally not
// flattened across applications, because their meaning depends on grouping.
type ControllerMiddlewareSet = readonly MiddlewareInput[];
type ControllerMiddlewareMetadata = readonly ControllerMiddlewareSet[];

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

const controllerPattern = {
  decorator: 'Controller' as const,
  basePath: P.string,
};

const useMiddlewarePattern = {
  decorator: 'UseMiddleware' as const,
  middlewares: P.array(),
};

const routePattern = {
  decorator: 'Route' as const,
  method: P.union(
    'GET' as const,
    'POST' as const,
    'PUT' as const,
    'PATCH' as const,
    'DELETE' as const,
  ),
  path: P.string,
};

const skipMiddlewarePattern = {
  decorator: 'SkipMiddleware' as const,
  skipped: P.array(),
};

const authorizedPattern = {
  decorator: 'Authorized' as const,
  roles: P.array(P.string),
};

export const getControllerMetadata = (cls: object): ControllerMetadata | undefined => {
  const meta = getClassMetadata(cls);
  if (!meta) return undefined;
  for (const p of meta.props) {
    const found = match(p)
      .with(
        controllerPattern,
        (c): ControllerMetadata => ({
          basePath: c.basePath,
          sourceFile: getSourcePosition(cls, { isFrameworkPath: isCoreFrameworkPath })?.sourceFile,
        }),
      )
      .otherwise(() => undefined);
    if (found) return found;
  }
  return undefined;
};

export const getRouteMetadata = (cls: object): readonly RouteMetadata[] => {
  const meta = getClassMetadata(cls);
  if (!meta) return [];
  const routes: RouteMetadata[] = [];
  const seen = new Set<string>();
  for (const m of meta.methods) {
    for (const p of m.props) {
      const entry = match(p)
        .with(
          routePattern,
          (r): RouteMetadata => ({ method: r.method, path: r.path, methodName: m.name }),
        )
        .otherwise(() => undefined);
      if (!entry) continue;
      const key = `${entry.method}\0${entry.path}\0${String(entry.methodName)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      routes.push(entry);
    }
  }
  return routes;
};

// Returns one entry per `@UseMiddleware(...)` application on the class, in the
// order they were applied (innermost decorator first, per TC39 evaluation
// order). Callers that need a single flat list should call `.flat()`.
// MiddlewareInput / MiddlewareIdentifier are domain types we can't structurally
// validate at this layer (functions and classes have no runtime tag). Trust
// that core's own decorators wrote the right shape into props.
const toMiddlewareInputs = (arr: readonly unknown[]): readonly MiddlewareInput[] =>
  arr as readonly MiddlewareInput[];
const toMiddlewareIdentifiers = (arr: readonly unknown[]): readonly MiddlewareIdentifier[] =>
  arr as readonly MiddlewareIdentifier[];

export const getControllerMiddlewareMetadata = (
  cls: object,
): ControllerMiddlewareMetadata | undefined => {
  const meta = getClassMetadata(cls);
  if (!meta) return undefined;
  const sets: ControllerMiddlewareSet[] = [];
  for (const p of meta.props) {
    const set = match(p)
      .with(useMiddlewarePattern, (um) => toMiddlewareInputs(um.middlewares))
      .otherwise(() => undefined);
    if (set) sets.push(set);
  }
  return sets.length > 0 ? sets : undefined;
};

export const getMethodMiddlewareMetadata = (cls: object): readonly MethodMiddlewareMetadata[] => {
  const meta = getClassMetadata(cls);
  if (!meta) return [];
  const result: MethodMiddlewareMetadata[] = [];
  for (const m of meta.methods) {
    for (const p of m.props) {
      const entry = match(p)
        .with(
          useMiddlewarePattern,
          (um): MethodMiddlewareMetadata => ({
            methodName: m.name,
            middlewares: toMiddlewareInputs(um.middlewares),
          }),
        )
        .otherwise(() => undefined);
      if (entry) result.push(entry);
    }
  }
  return result;
};

export const getSkipMiddlewareMetadata = (cls: object): readonly SkipMiddlewareMetadata[] => {
  const meta = getClassMetadata(cls);
  if (!meta) return [];
  const result: SkipMiddlewareMetadata[] = [];
  for (const m of meta.methods) {
    for (const p of m.props) {
      const entry = match(p)
        .with(
          skipMiddlewarePattern,
          (sm): SkipMiddlewareMetadata => ({
            methodName: m.name,
            skipped: toMiddlewareIdentifiers(sm.skipped),
          }),
        )
        .otherwise(() => undefined);
      if (entry) result.push(entry);
    }
  }
  return result;
};

export const getAuthorizedMetadata = (
  cls: object,
  methodName: string | symbol,
): AuthorizedMetadata | undefined => {
  const meta = getClassMetadata(cls);
  if (!meta) return undefined;
  for (const m of meta.methods) {
    if (m.name !== methodName) continue;
    for (const p of m.props) {
      const entry = match(p)
        .with(authorizedPattern, (a): AuthorizedMetadata => ({ methodName, roles: a.roles }))
        .otherwise(() => undefined);
      if (entry) return entry;
    }
  }
  return undefined;
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
  const controllerMeta = getControllerMetadata(cls);
  const basePath = controllerMeta?.basePath ?? '/';
  const routeMeta = getRouteMetadata(cls);

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
