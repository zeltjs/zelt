import type { RouteInfoLike } from './graph/index';

export type InspectableClass = new (...args: never[]) => unknown;

// core を runtime import しないため構造的型で受ける
export type FeatureLike = {
  readonly key: string;
  readonly featureClasses: () => readonly InspectableClass[];
  // HttpFeature 等が実装する読み取り専用 API。実装しない feature(eventbus 等)では省略可。
  // 戻り値は MiddlewareClass 本体、または { middleware, options } のラップのいずれもあり得るため
  // unknown[] で受け、classFromMiddlewareEntry で解く(@UseMiddleware の解決と同じ規則)
  readonly globalMiddlewares?: () => readonly unknown[];
};

export type AppLike = {
  readonly features: readonly FeatureLike[];
  readonly configs?: readonly InspectableClass[];
};

export const isAppLike = (value: unknown): value is AppLike => {
  if (typeof value !== 'object' || value === null) return false;
  const record: { features?: unknown } = value;
  return Array.isArray(record.features);
};

// filePath は stack trace 由来で、Windows では `\` 区切りになりうる。UI 側は
// split('/') 前提のため、グラフ JSON を生成するここで posix 区切りに正準化する
export const toPosixPath = (filePath: string): string => filePath.replaceAll('\\', '/');

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

const routeFromProp = (
  basePath: string,
  handler: string,
  prop: object,
): RouteInfoLike | undefined => {
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
): readonly RouteInfoLike[] => {
  if (typeof m.name !== 'string') return [];
  const routes: RouteInfoLike[] = [];
  for (const p of m.props) {
    const route = routeFromProp(basePath, m.name, p);
    if (route !== undefined) routes.push(route);
  }
  return routes;
};

export const extractRoutes = (meta: ClassMetaLike): readonly RouteInfoLike[] => {
  const basePath = basePathOf(meta.props);
  const routes: RouteInfoLike[] = [];
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
  // レビュー指摘6: method-level 適用の対象メソッド名。class-level 適用が別途あるかどうかとは
  // 独立に、method-level occurrence が1つでもあれば必ず設定する(以前は class-level 適用が
  // 1つでもあれば method-level occurrence 自体を握り潰していた)
  readonly methods?: readonly string[];
};

const isInspectableClass = (value: unknown): value is InspectableClass =>
  typeof value === 'function';

// middlewares の要素は MiddlewareClass 本体、または { middleware, options } のラップのいずれか
export const classFromMiddlewareEntry = (entry: unknown): InspectableClass | undefined => {
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

// 1つの decorator 適用(props オブジェクト1件)が、指定した middleware クラスを参照する
// @UseMiddleware(...) かどうかを判定する。analyzer-entry.ts が
// decorator-metadata の getDecoratorApplicationPosition(実行時 stack trace から decorator
// 適用の位置を引く)へ渡す matchesProps 述語として使う(Task 10 ブロッカーA: `@RateLimit`
// のような decorator ファクトリ経由の適用は AST 上 literal な `UseMiddleware` という
// 名前を持たないため、実行時メタデータを頼りに位置解決する)
export const propsAppliesMiddleware = (props: object, middleware: InspectableClass): boolean =>
  middlewareClassesOf([props]).includes(middleware);

// レビュー指摘6: 以前は class-level 適用の集合を Set にし、かつ「class-level に既にある
// middleware は method-level occurrence を作らない」「同じメソッドへの同じ middleware の
// 2回目以降の適用は無視する」という2つの経路で occurrence を握り潰していた。
// class-level・method-level は別々の適用箇所であり、同じメソッドへの複数回の適用も
// それぞれ別の applies-middleware エッジになるべきため(spec: 1件=1occurrence)、
// middlewareClassesOf が返す配列(1要素=1つの実際の @UseMiddleware(...) 適用)の
// 出現順・出現回数をそのまま保持する(Set/includes による重複排除を一切行わない)
export const extractMiddlewareRefs = (meta: ClassMetaLike): readonly MiddlewareRef[] => {
  const classLevelRefs = middlewareClassesOf(meta.props).map(
    (middleware): MiddlewareRef => ({ middleware }),
  );
  const methodsByClass = new Map<InspectableClass, string[]>();
  for (const m of meta.methods) {
    if (typeof m.name !== 'string') continue;
    for (const cls of middlewareClassesOf(m.props)) {
      const methods = methodsByClass.get(cls);
      if (methods === undefined) {
        methodsByClass.set(cls, [m.name]);
      } else {
        methods.push(m.name);
      }
    }
  }
  return [
    ...classLevelRefs,
    ...[...methodsByClass.entries()].map(
      ([middleware, methods]): MiddlewareRef => ({ middleware, methods }),
    ),
  ];
};
