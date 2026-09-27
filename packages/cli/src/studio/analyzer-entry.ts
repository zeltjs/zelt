// zelt studio の解析子プロセス。tsx で実行され、ユーザーの app をロードして
// 依存グラフ JSON をマーカー行で親プロセスへ渡す。realize() は呼ばない。

// c12(jiti) が独自キャッシュで app を評価すると、getClassSource が native import で
// 引くモジュールとクラスが別インスタンスになり identity 逆引きが壊れる(かつ app が
// 二重評価される)。tsx 配下では native import が TS を扱えるため jiti に native を優先させる
process.env['JITI_TRY_NATIVE'] ??= 'true';

import { relative, resolve } from 'node:path';
import type {
  FunctionRef,
  InspectError,
  ProgramCacheError,
} from '@zeltjs/decorator-metadata/inspect';
import {
  getCallSites,
  getClassDeclarations,
  getClassMetadata,
  getClassSource,
  getConfigAppFactoryRef,
  getDecoratorApplicationPosition,
  getDependencySources,
  getFunctionDeclarations,
  getFunctionSignature,
} from '@zeltjs/decorator-metadata/inspect';
import consola from 'consola';
import { errAsync, okAsync } from 'neverthrow';

import { loadZeltConfig } from '../config/index';
import type { AppLike, ClassMetaLike, InspectableClass } from './analyzer.lib';
import {
  classFromMiddlewareEntry,
  extractMiddlewareRefs,
  extractRoutes,
  isAppLike,
  propsAppliesMiddleware,
  toPosixPath,
} from './analyzer.lib';
import { GRAPH_MARKER } from './analyzer-protocol';
import type {
  AppliedMiddlewareV3,
  DependencyResolution,
  DependencyResolver,
  GraphRootV3,
  ResolveResult,
} from './graph/index';
import { buildDependencyGraph } from './graph/index';

// ─── root 収集 ───
// team-lead 決定(Task 10 ブロッカーA): @UseMiddleware(...) の行番号は、実行時メタデータ
// (decorator-metadata の getDecoratorApplicationPosition。decorator の stack trace に由来し、
// `@RateLimit` のような decorator ファクトリのラップに関係なく常に「ユーザーが decorator を
// 書いた行」を指す)で解決してここで運ぶ。解決できなかった場合のみ line を省略し、
// build-graph.lib.ts 側が getClassDeclarations/getFunctionDeclarations の DecoratorInfo
// から AST 経由で literal な `@UseMiddleware(X)` 一致にフォールバックする(旧経路。
// plain な @UseMiddleware はどちらの経路でも解決できるが、位置情報の SSOT は実行時メタデータの
// ため優先する)。
// レビュー指摘10: extractMiddlewareRefs はメソッドをグループ化した1件(methods: 複数)を返すが、
// applies-middleware エッジは occurrence(メソッド)単位にする必要があるため、ここで展開する
// (build-graph.lib.ts の seedRoot は appliedMiddlewares の要素数=エッジ数として扱う設計のまま)
// レビュー再指摘5: ClassSource が解決できない root/middleware を consola.error でログするだけで
// source: undefined のまま黙って組み立てるのは、実質的に「解析対象から静かに除外する」動作であり
// 9節の「未決事項を黙って解消しない」姿勢と矛盾する。GraphRootV3/AppliedMiddlewareV3.source は
// 必須フィールドになったため、解決できない場合はここで fatal にする(他の @throws と同じ扱い)
/** @throws {Error} from analyzer-entry.ts:appliedMiddlewaresOf */
const appliedMiddlewaresOf = async (
  cls: InspectableClass,
  meta: ClassMetaLike,
): Promise<AppliedMiddlewareV3[]> => {
  const perRef = await Promise.all(
    extractMiddlewareRefs(meta).map(async (ref) => {
      const source = await getClassSource(ref.middleware);
      if (source.isErr()) {
        throw new Error(
          `no ClassSource for middleware ${ref.middleware.name}: ${source.error.message}`,
        );
      }
      // class-level(methods 無し)は1件、method-level はメソッドごとに1件に展開する
      const occurrences: readonly (string | undefined)[] = ref.methods ?? [undefined];
      return occurrences.map((method): AppliedMiddlewareV3 => {
        const pos = getDecoratorApplicationPosition(
          cls,
          method === undefined ? { kind: 'class' } : { kind: 'method', name: method },
          (props) => propsAppliesMiddleware(props, ref.middleware),
        );
        return {
          className: ref.middleware.name,
          source: source.value,
          ...(method !== undefined ? { methods: [method] } : {}),
          ...(pos !== undefined ? { line: pos.line } : {}),
        };
      });
    }),
  );
  return perRef.flat();
};

// クラス自身の decorators は運ばない(v2 の extractDecoratorNames 経由のランタイム取得はもう
// 使わない)。ClassNode.decorators の唯一の情報源は Task 2 の getClassDeclarations であり、
// build-graph.lib.ts の seedClassOrExternal が都度解決する(設計判断メモ 10)
/**
 * @throws {Error} from analyzer-entry.ts:rootFromClass
 * @throws {Error} from analyzer-entry.ts:appliedMiddlewaresOf
 */
const rootFromClass =
  () =>
  async (cls: InspectableClass): Promise<GraphRootV3> => {
    const source = await getClassSource(cls);
    if (source.isErr()) {
      throw new Error(`no ClassSource for ${cls.name}: ${source.error.message}`);
    }
    const meta: ClassMetaLike = getClassMetadata(cls) ?? { props: [], methods: [] };
    const routes = extractRoutes(meta);
    const appliedMiddlewares = await appliedMiddlewaresOf(cls, meta);
    return {
      className: cls.name,
      source: source.value,
      ...(routes.length > 0 ? { routes } : {}),
      ...(appliedMiddlewares.length > 0 ? { appliedMiddlewares } : {}),
    };
  };

// globalMiddlewares() の戻り値は MiddlewareClass 本体、または { middleware, options } の
// ラップのいずれもあり得る(@UseMiddleware の参照解決と同じ形。classFromMiddlewareEntry を再利用)
const globalMiddlewareClasses = (app: AppLike): InspectableClass[] =>
  app.features.flatMap((feature) =>
    (feature.globalMiddlewares?.() ?? []).flatMap((entry) => {
      const cls = classFromMiddlewareEntry(entry);
      return cls === undefined ? [] : [cls];
    }),
  );

/**
 * @throws {Error} from analyzer-entry.ts:rootFromClass
 * @throws {Error} from analyzer-entry.ts:appliedMiddlewaresOf
 */
const collectRoots = async (app: AppLike): Promise<GraphRootV3[]> => {
  const toRoot = rootFromClass();
  const featureRoots = await Promise.all(
    app.features.flatMap((feature) => feature.featureClasses().map(toRoot)),
  );
  const globalMiddlewareRoots = await Promise.all(globalMiddlewareClasses(app).map(toRoot));
  const configRoots = await Promise.all((app.configs ?? []).map(toRoot));
  return [...featureRoots, ...globalMiddlewareRoots, ...configRoots];
};

/**
 * @throws {Error} from analyzer-entry.ts:loadApp
 * @throws {ZeltConfigLoadError} from config-loader.lib.ts:loadZeltConfig
 */
const loadApp = async (cwd: string, configFile: string | undefined): Promise<AppLike> => {
  const config = await loadZeltConfig(configFile !== undefined ? { cwd, configFile } : { cwd });
  const app: unknown = await config.app();
  if (!isAppLike(app)) {
    throw new Error(
      'config.app() did not return a zelt app (missing features array). Check zelt.config.ts',
    );
  }
  return app;
};

// レビュー再指摘(エラー体系の統一): BuildGraphV3Deps の各関数は ResultAsync<T, InspectError |
// ProgramCacheError> を直接返すようになった(Task 8 参照)。inspect 層の関数はそのまま
// 渡せばよく、以前のように isErr() を見て握り潰し・throw する変換は不要になった
// (「inspect 由来はそのまま伝播、包み直さない」)。DependencyResolver だけは
// ResolveResult への変換(ドメインロジック)を伴うため ResultAsync のチェーンとして書く
/** @throws {UnsupportedTypeScriptVersionError} from get-dependency-sources.lib.ts:getDependencySources */
const createResolveDependencies =
  (tsconfig: string): DependencyResolver =>
  (source) =>
    getDependencySources(source, { tsconfig })
      .map((sources) =>
        // dep.line は Task 2 で DependencySource に追加した line をそのまま転記する。
        // 依存側の decorators はもう運ばない(ClassNode.decorators は getClassDeclarations が
        // seedClassOrExternal 内で都度解決するため。設計判断メモ 10)。
        // レビュー指摘13: callback は常に1件の DependencyResolution を返す(配列を返して
        // 平坦化する必要はない)1:1 の変換のため、flatMap ではなく map を使う
        sources.map((dep): DependencyResolution => {
          if (dep.kind === 'unresolved') {
            consola.error(`[zelt studio] unresolved ${dep.localName}: ${dep.reason}`);
            return { kind: 'unresolved', localName: dep.localName };
          }
          return { kind: 'class', source: dep.source, line: dep.line };
        }),
      )
      .map((deps) => ({ kind: 'resolved' as const, deps }))
      .orElse((error) => {
        if (error.code === 'POSITION_INVALID') {
          consola.error(`[zelt studio] unresolved ${source.exportName}: ${error.message}`);
          return okAsync({ kind: 'unresolved' as const });
        }
        // レビュー再指摘(エラー体系の統一): resolveDependencies は build-graph.lib.ts の
        // class work item(seedClassOrExternal が packageFromPath で internal と判定済みの
        // クラス)にのみ呼ばれるため、その宣言ファイル自体が program に無い
        // (SOURCE_NOT_FOUND)のは「external である」という正常系のシグナルではなく矛盾
        // (バグ)。inspect 層の新設コード DECLARATION_NOT_FOUND として、包み直さず
        // InspectError のまま伝播する(BuildGraphError ではない)
        if (error.code === 'SOURCE_NOT_FOUND') {
          return errAsync<ResolveResult, InspectError>({
            code: 'DECLARATION_NOT_FOUND',
            message: `expected ${source.filePath}#${source.exportName} to be an internal class declaration, but its source file was not found in the program (${error.message})`,
          });
        }
        return errAsync<ResolveResult, InspectError | ProgramCacheError>(error);
      });

// ─── TypeScript Compiler API ベースの resolver 群(BuildGraphV3Deps に注入する) ───
// レビュー再指摘(エラー体系の統一): inspect 層の関数をそのまま渡すだけの薄いラッパー。
// isErr() を見て throw する変換はもう行わない(InspectError/ProgramCacheError は
// build-graph.lib.ts 側の unwrapDep がそのまま伝播させる)

/** @throws {UnsupportedTypeScriptVersionError} from get-function-declarations.lib.ts:getFunctionDeclarations */
const createGetFunctionDeclarations = (tsconfig: string) => (filePath: string) =>
  getFunctionDeclarations(filePath, { tsconfig });

/** @throws {UnsupportedTypeScriptVersionError} from get-function-signature.lib.ts:getFunctionSignature */
const createGetFunctionSignature = (tsconfig: string) => (ref: FunctionRef) =>
  getFunctionSignature(ref, { tsconfig });

/** @throws {UnsupportedTypeScriptVersionError} from get-call-sites.lib.ts:getCallSites */
const createGetCallSites = (tsconfig: string) => (ref: FunctionRef) =>
  getCallSites(ref, { tsconfig });

/** @throws {UnsupportedTypeScriptVersionError} from get-class-declarations.lib.ts:getClassDeclarations */
const createGetClassDeclarations = (tsconfig: string) => (filePath: string) =>
  getClassDeclarations(filePath, { tsconfig });

// レビュー指摘2: zelt.config.ts の app factory を関数 root として発見する。
// loadZeltConfig 自体は解決済みパスを公開しないため、CLI 指定(--config)があればそれ、
// 無ければ既定のファイル名で cwd から解決する(実運用のファイル名は常に zelt.config.ts)
const resolveConfigPath = (cwd: string, configFile: string | undefined): string =>
  resolve(cwd, configFile ?? 'zelt.config.ts');

// レビュー再指摘(エラー体系の統一): createResolveDependencies/createGetFunctionDeclarations 等は
// もう throw しない(InspectError/ProgramCacheError は buildDependencyGraph の
// ResultAsync<DependencyGraph, BuildGraphError | InspectError | ProgramCacheError> を経由して
// graphResult.isErr() に集約される)。fatal な throw は loadApp・rootFromClass・
// appliedMiddlewaresOf・getConfigAppFactoryRef の isErr() 分岐・resolveTypeScript のみ残る
/**
 * @throws {UnsupportedTypeScriptVersionError} from resolve-typescript.lib.ts:resolveTypeScript
 * @throws {Error} from analyzer-entry.ts:loadApp
 * @throws {Error} from analyzer-entry.ts:rootFromClass
 * @throws {Error} from analyzer-entry.ts:appliedMiddlewaresOf
 * @throws {ZeltConfigLoadError} from config-loader.lib.ts:loadZeltConfig
 */
const main = async (): Promise<void> => {
  const cwd = process.cwd();
  const app = await loadApp(cwd, process.argv[2]);
  const tsconfig = resolve(cwd, 'tsconfig.json');

  const roots = await collectRoots(app);
  const configPath = resolveConfigPath(cwd, process.argv[2]);
  const appFactoryResult = await getConfigAppFactoryRef(configPath, { tsconfig });
  if (appFactoryResult.isErr()) {
    throw new Error(`${appFactoryResult.error.code}: ${appFactoryResult.error.message}`);
  }
  const functionRoots = appFactoryResult.value !== undefined ? [appFactoryResult.value] : [];

  const graphResult = await buildDependencyGraph(
    roots,
    {
      formatPath: (filePath) => toPosixPath(relative(cwd, filePath)),
      resolveDependencies: createResolveDependencies(tsconfig),
      getFunctionDeclarations: createGetFunctionDeclarations(tsconfig),
      getFunctionSignature: createGetFunctionSignature(tsconfig),
      getCallSites: createGetCallSites(tsconfig),
      getClassDeclarations: createGetClassDeclarations(tsconfig),
    },
    functionRoots,
  );
  // レビュー指摘8: buildDependencyGraph は ResultAsync<DependencyGraph, BuildGraphError> を返す。
  // 握り潰さず fatal として扱う(他の @throws と同じ扱い)
  if (graphResult.isErr()) {
    throw new Error(`${graphResult.error.code}: ${graphResult.error.message}`);
  }
  process.stdout.write(`${GRAPH_MARKER}${JSON.stringify(graphResult.value)}\n`);
};

main().catch((error: unknown) => {
  consola.error(error);
  process.exitCode = 1;
});
