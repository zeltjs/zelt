// Zelt の app を読み込む子プロセス。tsx で実行され、createApp() までを評価して
// runtime の記録(blueprint と decorator metadata)を JSON で親へ渡す。
// createRuntime / realize は呼ばない。ここも親も TypeScript の AST は触らない。

import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { MiddlewareInput } from '@zeltjs/core';
import consola from 'consola';
import { custom, parse } from 'valibot';

import type {
  ZeltAuthorized,
  ZeltClass,
  ZeltClassRef,
  ZeltDependency,
  ZeltInspectDiagnostic,
  ZeltInspection,
  ZeltInspectRequest,
  ZeltMiddlewareUse,
  ZeltPosition,
  ZeltRoute,
} from './zelt-inspect-protocol';
import { ZELT_INSPECT_MARKER, ZeltInspectRequestSchema } from './zelt-inspect-protocol';
import { esmEntryUrlFrom } from './zelt-inspect-resolve.lib';

type AnyClass = new (...args: never[]) => unknown;

type SourceLike = { readonly filePath: string; readonly exportName: string };

/**
 * app が読み込んだ @zeltjs/decorator-metadata/inspect の、この子プロセスが使う範囲。
 * 実体は動的 import(identity を app と揃えるため)だが、形は本物の型で受ける。
 */
type InspectApi = Pick<
  typeof import('@zeltjs/decorator-metadata/inspect'),
  | 'getClassMetadata'
  | 'getClassSource'
  | 'getDecoratorApplicationPosition'
  | 'getDependencySources'
  | 'resolveClassSource'
  | 'packageFromPath'
  | 'normalizePackageName'
>;

type ClassMeta = NonNullable<ReturnType<InspectApi['getClassMetadata']>>;

const INSPECT_MEMBERS: readonly string[] = [
  'getClassMetadata',
  'getClassSource',
  'getDecoratorApplicationPosition',
  'getDependencySources',
  'resolveClassSource',
  'packageFromPath',
  'normalizePackageName',
];

const hasFunctions = (value: unknown, names: readonly string[]): boolean =>
  typeof value === 'object' &&
  value !== null &&
  names.every((name) => typeof Reflect.get(value, name) === 'function');

// 動的 import した module は unknown。schema で形を確かめてから型を与える
const InspectApiSchema = custom<InspectApi>(
  (value) => hasFunctions(value, INSPECT_MEMBERS),
  'the app resolves a @zeltjs/decorator-metadata without the inspect API',
);

const ClassSchema = custom<AnyClass>(
  (value) => typeof value === 'function',
  'the value is not a class',
);

// core の decorator が props に書いた値。class 本体か `{ middleware, options }` のラップ
const MiddlewareInputSchema = custom<MiddlewareInput>(
  (value) => typeof value === 'function' || (typeof value === 'object' && value !== null),
  'the recorded middleware is neither a class nor a bound middleware',
);

type BlueprintLike = {
  readonly getControllers?: () => readonly AnyClass[];
  readonly getMetadata?: () => {
    readonly controllers: readonly {
      readonly name: string;
      readonly routes: readonly {
        readonly method: string;
        readonly fullPath: string;
        readonly methodName: string;
      }[];
    }[];
  };
};

type FeatureLike = {
  readonly featureClasses: () => readonly AnyClass[];
  readonly globalMiddlewares?: () => readonly MiddlewareInput[];
  readonly blueprint?: () => BlueprintLike;
};

type AppLike = {
  readonly features: readonly FeatureLike[];
  readonly configs?: readonly AnyClass[];
};

const AppSchema = custom<AppLike>(
  (value) =>
    typeof value === 'object' && value !== null && Array.isArray(Reflect.get(value, 'features')),
  'the factory did not return a zelt app (missing features array)',
);

type FactoryModule = { readonly [key: string]: unknown };

const ModuleSchema = custom<FactoryModule>(
  (value) => typeof value === 'object' && value !== null,
  'the app factory module could not be loaded',
);

// ─── 収集 ───

type Context = {
  readonly inspect: InspectApi;
  readonly root: string;
  readonly tsconfig: string;
  readonly diagnostics: ZeltInspectDiagnostic[];
};

type Located = { readonly cls: AnyClass; readonly source: SourceLike; readonly ref: ZeltClassRef };

const note = (ctx: Context, code: string, message: string): void => {
  ctx.diagnostics.push({ code, message });
};

// stack trace 由来の path は Windows だと `\\` 区切りになりうるので posix に揃える
const toPosixPath = (filePath: string): string => filePath.replaceAll('\\', '/');

const refOf = (ctx: Context, source: SourceLike): ZeltClassRef => {
  const owner = ctx.inspect.packageFromPath(source.filePath);
  if (owner !== undefined) {
    return {
      package: ctx.inspect.normalizePackageName(owner.name),
      filePath: '',
      exportName: source.exportName,
    };
  }
  return {
    package: null,
    filePath: toPosixPath(relative(ctx.root, source.filePath)),
    exportName: source.exportName,
  };
};

const locate = async (ctx: Context, cls: AnyClass): Promise<Located | null> => {
  const result = await ctx.inspect.getClassSource(cls);
  if (result.isErr()) {
    note(ctx, 'zelt-class-source-unresolved', `${cls.name}: ${result.error.message}`);
    return null;
  }
  return { cls, source: result.value, ref: refOf(ctx, result.value) };
};

const positionOf = (
  ctx: Context,
  cls: AnyClass,
  target: { kind: 'class' } | { kind: 'method'; name: string },
  props: object,
): ZeltPosition | null => {
  const found = ctx.inspect.getDecoratorApplicationPosition(cls, target, (p) => p === props);
  if (found === undefined) return null;
  return { filePath: toPosixPath(relative(ctx.root, found.sourceFile)), line: found.line };
};

/** middlewares の要素は class 本体、または `{ middleware, options }` のラップ */
const asClass = (entry: MiddlewareInput): AnyClass[] =>
  typeof entry === 'function' ? [entry] : [entry.middleware];

const middlewareEntriesOf = (props: object): readonly MiddlewareInput[] => {
  const record: { decorator?: unknown; middlewares?: unknown } = props;
  if (record.decorator !== 'UseMiddleware' || !Array.isArray(record.middlewares)) return [];
  // core の decorator が書いた props なので、要素は MiddlewareInput(middleware.types.ts)
  return record.middlewares.flatMap((entry: unknown) =>
    typeof entry === 'function' || (typeof entry === 'object' && entry !== null)
      ? [parse(MiddlewareInputSchema, entry)]
      : [],
  );
};

const isAuthorized = (props: object): boolean => {
  const record: { decorator?: unknown } = props;
  return record.decorator === 'Authorized';
};

const decoratorNameOf = (props: object): string | null => {
  const record: { decorator?: unknown } = props;
  return typeof record.decorator === 'string' ? record.decorator : null;
};

const usesFromProps = async (
  ctx: Context,
  cls: AnyClass,
  target: { kind: 'class' } | { kind: 'method'; name: string },
  props: readonly object[],
): Promise<ZeltMiddlewareUse[]> => {
  const uses: ZeltMiddlewareUse[] = [];
  for (const prop of props) {
    for (const entry of middlewareEntriesOf(prop)) {
      const middleware = asClass(entry)[0];
      const located = middleware === undefined ? null : await locate(ctx, middleware);
      uses.push({
        target: located?.ref ?? null,
        on: target,
        position: positionOf(ctx, cls, target, prop),
      });
    }
  }
  return uses;
};

const middlewaresOf = async (
  ctx: Context,
  cls: AnyClass,
  meta: ClassMeta,
): Promise<ZeltMiddlewareUse[]> => {
  const uses = await usesFromProps(ctx, cls, { kind: 'class' }, meta.props);
  for (const method of meta.methods) {
    if (typeof method.name !== 'string') continue;
    uses.push(
      ...(await usesFromProps(ctx, cls, { kind: 'method', name: method.name }, method.props)),
    );
  }
  return uses;
};

const authorizedOf = (ctx: Context, cls: AnyClass, meta: ClassMeta): ZeltAuthorized[] => {
  const found: ZeltAuthorized[] = [];
  for (const method of meta.methods) {
    if (typeof method.name !== 'string') continue;
    for (const prop of method.props) {
      if (!isAuthorized(prop)) continue;
      found.push({
        methodName: method.name,
        position: positionOf(ctx, cls, { kind: 'method', name: method.name }, prop),
      });
    }
  }
  return found;
};

const baseOf = async (ctx: Context, cls: AnyClass): Promise<Located | null> => {
  const prototype: unknown = Object.getPrototypeOf(cls);
  if (typeof prototype !== 'function' || prototype === Function.prototype) return null;
  return locate(ctx, parse(ClassSchema, prototype));
};

const dependenciesOf = async (
  ctx: Context,
  located: Located,
): Promise<{ readonly dependencies: ZeltDependency[]; readonly nested: SourceLike[] }> => {
  const result = await ctx.inspect.getDependencySources(located.source, { tsconfig: ctx.tsconfig });
  if (result.isErr()) {
    note(ctx, 'zelt-dependencies-unresolved', `${located.ref.exportName}: ${result.error.message}`);
    return { dependencies: [], nested: [] };
  }
  const dependencies: ZeltDependency[] = [];
  const nested: SourceLike[] = [];
  for (const dependency of result.value) {
    if (dependency.kind !== 'class') {
      note(
        ctx,
        'zelt-dependency-unresolved',
        `${located.ref.exportName}.${dependency.localName}: ${dependency.reason}`,
      );
      continue;
    }
    const ref = refOf(ctx, dependency.source);
    dependencies.push({ target: ref, localName: dependency.localName, line: dependency.line });
    if (ref.package === null) nested.push(dependency.source);
  }
  return { dependencies, nested };
};

const classOfSource = async (ctx: Context, source: SourceLike): Promise<AnyClass | null> => {
  const result = await ctx.inspect.resolveClassSource(source);
  if (result.isErr()) {
    note(ctx, 'zelt-class-unresolved', `${source.exportName}: ${result.error.message}`);
    return null;
  }
  return result.value;
};

const decoratorsOf = (meta: ClassMeta): string[] =>
  meta.props.flatMap((prop) => {
    const name = decoratorNameOf(prop);
    return name === null ? [] : [name];
  });

const classEntryOf = async (
  ctx: Context,
  here: Located,
): Promise<{ readonly entry: ZeltClass; readonly nested: readonly SourceLike[] }> => {
  const meta: ClassMeta = ctx.inspect.getClassMetadata(here.cls) ?? {
    props: [],
    methods: [],
    properties: [],
  };
  const base = await baseOf(ctx, here.cls);
  // package の class は地図では境界の箱なので、中の配線はたどらない(4.2)
  const inner =
    here.ref.package === null ? await dependenciesOf(ctx, here) : { dependencies: [], nested: [] };
  return {
    entry: {
      ref: here.ref,
      decorators: decoratorsOf(meta),
      base: base?.ref ?? null,
      dependencies: inner.dependencies,
      middlewares: await middlewaresOf(ctx, here.cls, meta),
      authorized: authorizedOf(ctx, here.cls, meta),
    },
    nested: inner.nested,
  };
};

/** 登録された class から inject の依存をたどり、地図に載りうる class を集める */
const collectClasses = async (
  ctx: Context,
  roots: readonly AnyClass[],
): Promise<{ readonly classes: ZeltClass[]; readonly located: Map<AnyClass, Located> }> => {
  const classes: ZeltClass[] = [];
  const located = new Map<AnyClass, Located>();
  const queue = [...roots];
  const seen = new Set<AnyClass>();
  while (queue.length > 0) {
    const cls = queue.shift();
    if (cls === undefined || seen.has(cls)) continue;
    seen.add(cls);
    const here = await locate(ctx, cls);
    if (here === null) continue;
    located.set(cls, here);
    const { entry, nested } = await classEntryOf(ctx, here);
    classes.push(entry);
    for (const source of nested) {
      const found = await classOfSource(ctx, source);
      if (found !== null) queue.push(found);
    }
  }
  return { classes, located };
};

type ControllerInfo = NonNullable<
  ReturnType<NonNullable<BlueprintLike['getMetadata']>>
>['controllers'][number];

const routesOfController = (ref: ZeltClassRef, info: ControllerInfo): ZeltRoute[] =>
  info.routes.map((route) => ({
    controller: ref,
    methodName: route.methodName,
    method: route.method,
    fullPath: route.fullPath,
  }));

/** blueprint は controller の class と metadata を同じ順で作る。名前では結ばない(付録D) */
const controllerRefOf = (
  cls: AnyClass | undefined,
  info: ControllerInfo,
  located: ReadonlyMap<AnyClass, Located>,
): ZeltClassRef | undefined => {
  if (cls === undefined || cls.name !== info.name) return undefined;
  return located.get(cls)?.ref;
};

/** http 以外の feature は controller を持たないので、どちらも空になる */
const controllersOf = (
  feature: FeatureLike,
): {
  readonly controllers: readonly AnyClass[];
  readonly metadata: readonly ControllerInfo[];
} => {
  const blueprint = feature.blueprint?.();
  if (blueprint === undefined) return { controllers: [], metadata: [] };
  return {
    controllers: blueprint.getControllers?.() ?? [],
    metadata: blueprint.getMetadata?.().controllers ?? [],
  };
};

const routesOfFeature = (
  ctx: Context,
  feature: FeatureLike,
  located: ReadonlyMap<AnyClass, Located>,
): ZeltRoute[] => {
  const { controllers, metadata } = controllersOf(feature);
  const routes: ZeltRoute[] = [];
  for (const [index, info] of metadata.entries()) {
    const ref = controllerRefOf(controllers[index], info, located);
    if (ref === undefined) {
      note(ctx, 'zelt-controller-unresolved', `${info.name} is not the controller at ${index}`);
      continue;
    }
    routes.push(...routesOfController(ref, info));
  }
  return routes;
};

const middlewareClassesOf = (feature: FeatureLike): AnyClass[] =>
  (feature.globalMiddlewares?.() ?? []).flatMap(asClass);

// ─── 入口 ───

/** @throws {Error} from zelt-inspect-resolve.lib.ts:esmEntryUrlFrom */
const importFromApp = async (from: string, name: string, subpath: string): Promise<unknown> =>
  import(esmEntryUrlFrom(from, name, subpath));

const FactorySchema = custom<() => unknown>(
  (value) => typeof value === 'function',
  'the app factory export is not a function',
);

/** @throws {ValiError} when the factory export is missing or is not a function */
const callFactory = async (file: string, exportName: string): Promise<AppLike> => {
  const module = parse(ModuleSchema, await import(pathToFileURL(file).href));
  const factory = parse(FactorySchema, module[exportName]);
  return parse(AppSchema, factory());
};

const uniqueRefs = (refs: readonly ZeltClassRef[]): ZeltClassRef[] => {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.package ?? ''}\u0000${ref.filePath}\u0000${ref.exportName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * @throws {Error} when the app, the inspect API or the factory cannot be loaded
 */
const inspectApplication = async (request: ZeltInspectRequest): Promise<ZeltInspection> => {
  const factoryFile = resolve(request.root, request.factory.filePath);
  const inspect = parse(
    InspectApiSchema,
    await importFromApp(factoryFile, '@zeltjs/decorator-metadata', './inspect'),
  );
  const app = await callFactory(factoryFile, request.factory.exportName);

  const ctx: Context = {
    inspect,
    root: request.root,
    tsconfig: request.tsconfig,
    diagnostics: [],
  };
  const featureClasses = app.features.flatMap((feature) => feature.featureClasses());
  const appMiddlewares = app.features.flatMap(middlewareClassesOf);
  const configs = app.configs ?? [];
  // 全 route の前を通るのは app が feature に書いた middlewares だけ。
  // core が router ごとに先に登録するものは app のコードに現れないので運ばない
  const globalClasses = appMiddlewares;
  const registeredClasses = [...featureClasses, ...appMiddlewares, ...configs];

  const { classes, located } = await collectClasses(ctx, [...registeredClasses, ...globalClasses]);
  const refOfClass = (cls: AnyClass): ZeltClassRef[] => {
    const found = located.get(cls);
    return found === undefined ? [] : [found.ref];
  };
  return {
    applicationId: request.applicationId,
    factory: request.factory,
    registered: uniqueRefs(registeredClasses.flatMap(refOfClass)),
    globalMiddlewares: uniqueRefs(globalClasses.flatMap(refOfClass)),
    classes,
    routes: app.features.flatMap((feature) => routesOfFeature(ctx, feature, located)),
    diagnostics: ctx.diagnostics,
  };
};

/** @throws {Error} from zelt-inspect-entry.ts:inspectApplication */
const main = async (): Promise<void> => {
  const argument: unknown = JSON.parse(process.argv[2] ?? '{}');
  const request: ZeltInspectRequest = parse(ZeltInspectRequestSchema, argument);
  const inspection = await inspectApplication(request);
  process.stdout.write(`${ZELT_INSPECT_MARKER}${JSON.stringify(inspection)}\n`);
};

main().catch((error: unknown) => {
  consola.error(error);
  process.exitCode = 1;
});
