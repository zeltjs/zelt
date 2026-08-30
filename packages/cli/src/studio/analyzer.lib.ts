import { getPublicMethodSignatures } from '@zeltjs/decorator-metadata/inspect';

import type { ContractResolver, RouteInfo } from './graph/index';

export type InspectableClass = new (...args: never[]) => unknown;

// core を runtime import しないため構造的型で受ける
export type FeatureLike = {
  readonly key: string;
  readonly featureClasses: () => readonly InspectableClass[];
};

export type AppLike = {
  readonly features: readonly FeatureLike[];
};

export const isAppLike = (value: unknown): value is AppLike => {
  if (typeof value !== 'object' || value === null) return false;
  const record: { features?: unknown } = value;
  return Array.isArray(record.features);
};

// filePath は stack trace 由来で、Windows では `\` 区切りになりうる。UI 側は
// split('/') 前提のため、グラフ JSON を生成するここで posix 区切りに正準化する
export const toPosixPath = (filePath: string): string => filePath.replaceAll('\\', '/');

const decoratorNameOf = (prop: object): readonly string[] => {
  const record: { decorator?: unknown } = prop;
  return typeof record.decorator === 'string' ? [record.decorator] : [];
};

export const extractDecoratorNames = (props: readonly object[]): readonly string[] =>
  props.flatMap(decoratorNameOf);

// getClassMetadata の戻り(ClassMeta)を構造的に受ける。core / decorator-metadata の
// 型に依存しないのは、この analyzer がユーザープロジェクト内で動くため
export type ClassMetaLike = {
  readonly props: readonly object[];
  readonly methods: readonly {
    readonly name: string | symbol;
    readonly props: readonly object[];
  }[];
};

// core の path-utils.lib:joinPath と同義。core を runtime import しない境界のための最小複製
const stripTrailingSlash = (s: string): string => (s.endsWith('/') ? s.slice(0, -1) : s);
const ensureLeadingSlash = (s: string): string => (s === '' || s.startsWith('/') ? s : `/${s}`);
const joinPath = (base: string, sub: string): string => {
  const a = stripTrailingSlash(base);
  const b = stripTrailingSlash(ensureLeadingSlash(sub));
  const joined = `${a}${b === '/' ? '' : b}`;
  return joined === '' ? '/' : joined;
};

const basePathOf = (props: readonly object[]): string => {
  for (const p of props) {
    const record: { decorator?: unknown; basePath?: unknown } = p;
    if (record.decorator === 'Controller' && typeof record.basePath === 'string') {
      return record.basePath;
    }
  }
  return '/';
};

const routeFromProp = (basePath: string, handler: string, prop: object): RouteInfo | undefined => {
  const record: { decorator?: unknown; method?: unknown; path?: unknown } = prop;
  if (
    record.decorator === 'Route' &&
    typeof record.method === 'string' &&
    typeof record.path === 'string'
  ) {
    return { method: record.method, path: joinPath(basePath, record.path), handler };
  }
  return undefined;
};

const routesForMethod = (
  basePath: string,
  m: ClassMetaLike['methods'][number],
): readonly RouteInfo[] => {
  if (typeof m.name !== 'string') return [];
  const routes: RouteInfo[] = [];
  for (const p of m.props) {
    const route = routeFromProp(basePath, m.name, p);
    if (route !== undefined) routes.push(route);
  }
  return routes;
};

export const extractRoutes = (meta: ClassMetaLike): readonly RouteInfo[] => {
  const basePath = basePathOf(meta.props);
  const routes: RouteInfo[] = [];
  // core の getRouteMetadata と同じキーで重複 metadata を除外する
  const seen = new Set<string>();
  for (const m of meta.methods) {
    for (const route of routesForMethod(basePath, m)) {
      const key = `${route.method}\0${route.path}\0${route.handler}`;
      if (seen.has(key)) continue;
      seen.add(key);
      routes.push(route);
    }
  }
  return routes;
};

export type MiddlewareRef = {
  readonly middleware: InspectableClass;
  // method-level 適用のみ: 対象メソッド名。class-level 適用が 1 つでもあれば undefined
  readonly methods?: readonly string[];
};

const isInspectableClass = (value: unknown): value is InspectableClass =>
  typeof value === 'function';

// middlewares の要素は MiddlewareClass 本体、または { middleware, options } のラップのいずれか
const classFromMiddlewareEntry = (entry: unknown): InspectableClass | undefined => {
  if (isInspectableClass(entry)) return entry;
  if (typeof entry === 'object' && entry !== null) {
    const wrapped: { middleware?: unknown } = entry;
    if (isInspectableClass(wrapped.middleware)) return wrapped.middleware;
  }
  return undefined;
};

// props の middlewares 配列は MiddlewareClass | { middleware, options } の混在
const middlewareClassesOf = (props: readonly object[]): InspectableClass[] => {
  const classes: InspectableClass[] = [];
  for (const p of props) {
    const record: { decorator?: unknown; middlewares?: unknown } = p;
    if (record.decorator !== 'UseMiddleware' || !Array.isArray(record.middlewares)) continue;
    for (const entry of record.middlewares) {
      const cls = classFromMiddlewareEntry(entry);
      if (cls !== undefined) classes.push(cls);
    }
  }
  return classes;
};

export const extractMiddlewareRefs = (meta: ClassMetaLike): readonly MiddlewareRef[] => {
  const classLevel = new Set(middlewareClassesOf(meta.props));
  const methodsByClass = new Map<InspectableClass, string[]>();
  for (const m of meta.methods) {
    if (typeof m.name !== 'string') continue;
    for (const cls of middlewareClassesOf(m.props)) {
      if (classLevel.has(cls)) continue;
      const methods = methodsByClass.get(cls);
      if (methods === undefined) {
        methodsByClass.set(cls, [m.name]);
      } else if (!methods.includes(m.name)) {
        methods.push(m.name);
      }
    }
  }
  return [
    ...[...classLevel].map((middleware): MiddlewareRef => ({ middleware })),
    ...[...methodsByClass.entries()].map(
      ([middleware, methods]): MiddlewareRef => ({ middleware, methods }),
    ),
  ];
};

// 契約は deps 解決済み(=program 内)のノードでのみ呼ばれるため、失敗は全体異常として fatal に扱う
/**
 * @throws {Error} from analyzer.lib.ts:createResolveContract
 * @throws {UnsupportedTypeScriptVersionError} from resolve-typescript.lib.ts:resolveTypeScript
 */
export const createResolveContract =
  (tsconfig: string): ContractResolver =>
  async (source) => {
    const result = await getPublicMethodSignatures(source, { tsconfig });
    if (result.isErr()) throw new Error(`${result.error.code}: ${result.error.message}`);
    return result.value;
  };
