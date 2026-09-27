import { posix } from 'node:path';
import type {
  CallSite,
  CallSiteTarget,
  ClassDeclarationInfo,
  ClassSource,
  DecoratorInfo,
  FunctionContract,
  FunctionDeclarationInfo,
  FunctionRef,
  InspectError,
  ProgramCacheError,
} from '@zeltjs/decorator-metadata/inspect';
import { normalizePackageName, packageFromPath } from '@zeltjs/decorator-metadata/inspect';
import type { Result, ResultAsync } from 'neverthrow';
import { err, ok, ResultAsync as ResultAsyncCtor } from 'neverthrow';
import { match } from 'ts-pattern';

import type {
  DependencyGraph,
  EntryInfo,
  GraphEdgeV3,
  GraphNodeV3,
  UnresolvedCall,
} from './graph.types';

// ─── 判別共用体の絞り込み(in演算子・型述語・as を使わず ts-pattern の match で分岐する) ───

export const isExternalNode = (n: GraphNodeV3): boolean =>
  match(n)
    .with({ external: true }, () => true)
    .otherwise(() => false);

// ─── 純粋ヘルパー ───

export const moduleOf = (filePath: string): string => posix.dirname(filePath);

export const fileKindOf = (filePath: string): string | null => {
  const segments = posix.basename(filePath).split('.');
  return segments.length >= 3 ? (segments.at(-2) ?? null) : null;
};

export const classNodeId = (filePath: string, name: string): string => `${filePath}#${name}`;
export const fnNodeId = (filePath: string, owner: string | undefined, name: string): string =>
  owner === undefined ? `${filePath}#${name}` : `${filePath}#${owner}.${name}`;
export const externalNodeId = (pkg: string, member: string): string => `ext:${pkg}#${member}`;

// レビュー再指摘11: normalizePackageName は class-source.lib.ts(packageFromPath と同じ
// ファイル)から import する(Task 4 の get-call-sites.lib.ts との重複実装を排除)

// ─── 型 ───

export type RouteInfoLike = {
  readonly method: string;
  readonly path: string;
  readonly handler: string;
};

// team-lead 決定(Task 10 ブロッカーA): `@RateLimit({...})` のように内部で
// `UseMiddleware(RateLimitMiddleware, opts)` を呼ぶだけの decorator ファクトリは、AST 上の
// decorator 名が `UseMiddleware` と一致しないため、旧来の「getClassDeclarations/
// getFunctionDeclarations の decorators(args)から動的に引く」だけでは line を解決できない
// (実例: ec-backend の AuthController.register/login)。実行時メタデータは
// `RateLimitMiddleware` が適用されている事実自体は正しく発見できるため、analyzer-entry.ts が
// decorator-metadata の getDecoratorApplicationPosition(実行時 stack trace 由来、factory の
// ラップに関係なく常に「ユーザーが decorator を書いた行」を指す)で解決した line をここに
// 運ぶ。line が無い(解決できなかった)場合のみ、build-graph.lib.ts 側が
// getClassDeclarations/getFunctionDeclarations の AST 経由の literal `@UseMiddleware(X)`
// 一致にフォールバックする(fail-loud は両方失敗したときの最終手段として残す)
export type AppliedMiddlewareV3 = {
  readonly className: string;
  // レビュー再指摘5: ClassSource が解決できない middleware を黙って source: undefined で
  // 作らない。呼び出し元(Task 9)が解決失敗を fatal として扱う前提でこの型は必須にする
  readonly source: ClassSource;
  // レビュー再指摘9: Interfaces節のプレビューと実装で `readonly string[]` / `readonly [string]`
  // が食い違っていた。1件=1occurrence(レビュー指摘10)の設計に合わせタプルへ統一する
  readonly methods?: readonly [string];
  readonly line?: number;
};

export type GraphRootV3 = {
  readonly className: string;
  readonly source: ClassSource;
  readonly routes?: readonly RouteInfoLike[];
  readonly appliedMiddlewares?: readonly AppliedMiddlewareV3[];
};

export type DependencyResolution =
  | { kind: 'class'; readonly source: ClassSource; readonly line: number }
  | { kind: 'unresolved'; readonly localName: string };

export type ResolveResult =
  | { kind: 'resolved'; readonly deps: readonly DependencyResolution[] }
  | { kind: 'external' }
  | { kind: 'unresolved' };

// レビュー再指摘(エラー体系の統一): 各注入関数は inspect 層の関数(getFunctionDeclarations
// 等)をそのまま渡せるよう ResultAsync<T, InspectError | ProgramCacheError> を返す形に統一する。
// Task 9 側はもう isErr() を見て throw する変換をせず、inspect 層の関数をそのまま渡すだけになる
export type DependencyResolver = (
  source: ClassSource,
) => ResultAsync<ResolveResult, InspectError | ProgramCacheError>;

export type BuildGraphV3Deps = {
  readonly formatPath?: (filePath: string) => string;
  readonly resolveDependencies: DependencyResolver;
  readonly getFunctionDeclarations: (
    filePath: string,
  ) => ResultAsync<readonly FunctionDeclarationInfo[], InspectError | ProgramCacheError>;
  readonly getFunctionSignature: (
    ref: FunctionRef,
  ) => ResultAsync<FunctionContract, InspectError | ProgramCacheError>;
  readonly getCallSites: (
    ref: FunctionRef,
  ) => ResultAsync<readonly CallSite[], InspectError | ProgramCacheError>;
  // ClassNode.loc/decorators の唯一の情報源。ClassSource 由来・internal-class ターゲット由来の
  // どちらも同じプリミティブ(Task 2 の getClassDeclarations)で解決する
  readonly getClassDeclarations: (
    filePath: string,
  ) => ResultAsync<readonly ClassDeclarationInfo[], InspectError | ProgramCacheError>;
  readonly isSubscribeCandidate?: (
    target: CallSiteTarget,
    firstArgLiteral: string | undefined,
  ) => boolean;
};

// ─── event 相関の既定判定(差し替え可能。spec 5(e)・9節の将来の変更に備えた注記) ───

const lastMemberSegment = (member: string): string => member.split('.').at(-1) ?? member;

const defaultIsSubscribeCandidate = (
  target: CallSiteTarget,
  firstArgLiteral: string | undefined,
): boolean => {
  if (firstArgLiteral === undefined || target.kind !== 'external') return false;
  if (target.package !== '@zeltjs/eventbus') return false;
  const last = lastMemberSegment(target.member);
  return last === 'on' || last === 'once';
};

const isEmitCandidate = (target: CallSiteTarget, firstArgLiteral: string | undefined): boolean => {
  if (firstArgLiteral === undefined || target.kind !== 'external') return false;
  return target.package === '@zeltjs/eventbus' && lastMemberSegment(target.member) === 'emit';
};

// ─── ワークキュー ───

type WorkItem =
  // declName: source.exportName(default export なら 'default'、`export { A as B }` なら B)
  // ではなく、seedClassOrExternal(decl-name lookup)で解決済みの宣言名。FunctionRef.owner は常に宣言名を使う
  // (Task 1 設計)ため、injects の from id・enqueueFunctionsOfClass の owner 突き合わせの
  // どちらも declName を使う必要がある(レビュー指摘6)
  | { kind: 'class'; readonly source: ClassSource; readonly declName: string }
  | { kind: 'function'; readonly ref: FunctionRef };

type ClassEntryHints = {
  readonly routesByHandler?: ReadonlyMap<string, RouteInfoLike>;
  readonly isMiddleware?: boolean;
};

// レビュー再指摘10: column を occurrence identity として持たせる(line だけでは同一行・
// 別列の複数 emit/subscribe 呼び出しを区別できず、辺重複排除で片方が消えてしまう)
type EmitCandidate = {
  readonly from: string;
  readonly event: string;
  readonly line: number;
  readonly column: number;
};
type SubscribeCandidate = {
  readonly event: string;
  readonly to: string;
  readonly line: number;
  readonly column: number;
};

type State = {
  readonly nodes: Map<string, GraphNodeV3>;
  readonly edgeKeys: Set<string>;
  readonly edges: GraphEdgeV3[];
  readonly queue: WorkItem[];
  readonly visitedClasses: Set<string>;
  readonly visitedFunctions: Set<string>;
  // レビュー指摘12: 関数をキューに積む(WorkItem を push する)3箇所すべてが push 前に
  // ここへ記録することで、同一関数が処理される前に複数回 enqueue されるのを防ぐ。
  // visitedFunctions は processFunctionItem が実際に処理し終えたことを示す別集合であり、
  // 目的が異なる(こちらは push 時点、visitedFunctions は処理時点)ため統合しない
  readonly enqueuedFunctions: Set<string>;
  readonly entryHints: Map<string, ClassEntryHints>;
  readonly formatPath: (filePath: string) => string;
  readonly deps: BuildGraphV3Deps;
  readonly emitCandidates: EmitCandidate[];
  readonly subscribeCandidates: SubscribeCandidate[];
  // レビュー指摘12: 同一ファイルに対する getFunctionDeclarations/getClassDeclarations の
  // 呼び出しをファイルパス単位でメモ化する(1クラスの複数メソッドを処理する過程で
  // 同じファイルに何度も問い合わせるのを防ぐ)。Promise ごとキャッシュすることで
  // 同時に発生した呼び出し同士の重複解決も避ける
  readonly functionDeclCache: Map<string, ReturnType<BuildGraphV3Deps['getFunctionDeclarations']>>;
  readonly classDeclCache: Map<string, ReturnType<BuildGraphV3Deps['getClassDeclarations']>>;
};

// ─── レビュー指摘8・9・10: エラーを握り潰さない ───
// buildDependencyGraph は ResultAsync<DependencyGraph, BuildGraphError | InspectError |
// ProgramCacheError> を返す。内部実装は従来どおり素朴な async/await のままにし、失敗したい
// 箇所で BuildGraphFailure(build-graph.lib.ts 自身が検出した構造的な不整合)または
// InspectFailure(inspect 層から伝播してきた失敗)を throw する(このリポジトリは
// no-throw/no-try-catch を全体で許可済み)。最上位の buildDependencyGraph だけが
// ResultAsync.fromPromise の mapError で変換する(レビュー再指摘2: BuildGraphFailure 以外の
// 例外でも reject しうるため、reject しない Promise 前提の fromSafePromise ではなく
// fromPromise + mapError を使う)
// レビュー再指摘(エラー体系の統一): DECLARATION_NOT_FOUND は inspect 層の InspectErrorCode
// (Task 2 で追加)に一本化し、BuildGraphErrorCode は build-graph.lib.ts 自身が検出する
// 構造的な不整合(DUPLICATE_NODE_ID/MULTIPLE_ENTRIES)と、予期しない例外(UNEXPECTED_ERROR)の
// 3つに限定する
export type BuildGraphErrorCode = 'DUPLICATE_NODE_ID' | 'MULTIPLE_ENTRIES' | 'UNEXPECTED_ERROR';
export type BuildGraphError = {
  readonly code: BuildGraphErrorCode;
  readonly message: string;
  readonly cause?: unknown;
};

class BuildGraphFailure extends Error {
  readonly buildGraphError: BuildGraphError;
  constructor(error: BuildGraphError) {
    super(error.message);
    this.buildGraphError = error;
  }
}

/** @throws {BuildGraphFailure} */
const fail = (error: BuildGraphError): never => {
  throw new BuildGraphFailure(error);
};

// inspect 層由来の失敗(InspectError | ProgramCacheError)を、包み直さずそのまま
// buildDependencyGraph の err として伝播させるための運び役。BuildGraphFailure と同じ
// 「throw して最上位の fromPromise だけが受け止める」パターンを使う
class InspectFailure extends Error {
  readonly inspectError: InspectError | ProgramCacheError;
  constructor(error: InspectError | ProgramCacheError) {
    super(error.message);
    this.inspectError = error;
  }
}

/** @throws {InspectFailure} */
const failInspect = (error: InspectError | ProgramCacheError): never => {
  throw new InspectFailure(error);
};

// BuildGraphV3Deps の各関数は ResultAsync<T, InspectError | ProgramCacheError> を返す。
// 呼び出し側は従来どおりの素朴な async/await を保つため、await した Result を
// この関数で「成功なら値を返す・失敗なら InspectFailure を throw する」に変換して使う
/** @throws {InspectFailure} */
const unwrapDep = <T>(result: Result<T, InspectError | ProgramCacheError>): T => {
  if (result.isErr()) return failInspect(result.error);
  return result.value;
};

const addEdge = (state: State, edge: GraphEdgeV3, dedupSuffix?: string): void => {
  // レビュー指摘12: dedupSuffix(calls エッジでは呼び出し式の column)を鍵に含めることで、
  // 同一行・別列の2つの呼び出し(例: `a(); b();` を1行に書いたコード)が同じ宛先を指す場合でも
  // 別々の辺として記録する。JSON に出す GraphEdgeV3 自体には column を含めない(edge.line のみ)
  const key = `${edge.from}->${edge.to}#${edge.kind}#${edge.line}${dedupSuffix !== undefined ? `#${dedupSuffix}` : ''}`;
  if (state.edgeKeys.has(key)) return;
  state.edgeKeys.add(key);
  state.edges.push(edge);
};

// レビュー指摘12: 同一ファイルに対する getFunctionDeclarations/getClassDeclarations は
// 1クラスの複数メソッドを処理する過程で何度も呼ばれうる(例: enqueueFunctionsOfClass が
// 列挙 → その各メソッドの createFnNode が再度同じファイルを問い合わせる)。ファイルパス単位で
// Promise をキャッシュし、同じファイルへの2回目以降の問い合わせは実行済み(または実行中)の
// Promise を再利用する
const getFunctionDeclarationsCached = (
  state: State,
  filePath: string,
): ReturnType<BuildGraphV3Deps['getFunctionDeclarations']> => {
  const cached = state.functionDeclCache.get(filePath);
  if (cached !== undefined) return cached;
  const result = state.deps.getFunctionDeclarations(filePath);
  state.functionDeclCache.set(filePath, result);
  return result;
};

const getClassDeclarationsCached = (
  state: State,
  filePath: string,
): ReturnType<BuildGraphV3Deps['getClassDeclarations']> => {
  const cached = state.classDeclCache.get(filePath);
  if (cached !== undefined) return cached;
  const result = state.deps.getClassDeclarations(filePath);
  state.classDeclCache.set(filePath, result);
  return result;
};

const decoratorsOfClassNode = (state: State, classId: string): readonly string[] =>
  match(state.nodes.get(classId))
    .with({ kind: 'class' }, (classNode) => classNode.decorators)
    .otherwise(() => []);

// クラス自身の loc/decorators は getClassDeclarations の1回の呼び出しから引く
// (ClassSource 由来・internal-class ターゲット由来のどちらの経路もこれを通る)。
// decorators は raw の DecoratorInfo(line/args 付き)のまま返す。ClassNode.decorators
// (v3 スキーマ、string[])への変換は呼び出し側の責務(applies-middleware の line 突き合わせに
// 生の DecoratorInfo が必要なため、ここでは名前だけに丸めない。team-lead 決定)
type ClassDeclLookup = {
  readonly name: string;
  readonly loc: { readonly start: number; readonly end: number };
  readonly decorators: readonly DecoratorInfo[];
};

const declLookupResult = (decl: ClassDeclarationInfo): ClassDeclLookup => ({
  name: decl.name,
  loc: decl.loc,
  decorators: decl.decorators,
});

// レビュー再指摘6: 「name === v || exportName === v」という単一の find は、ある宣言の
// 宣言名と、別クラスの export alias が同名になるケース(例: `class Foo {}` と
// `class Bar {} export { Bar as Foo };` が同一ファイルに同居)で誤った宣言に解決しうる。
// 呼び出し元の文脈(export identity で引きたいのか、宣言名そのもので引きたいのか)によって
// 探し方を分ける
//
// export identity(ClassSource.exportName: default export なら 'default'、
// `export { A as B }` なら 'B')で引く。exportName が省略されている宣言(名前どおり
// named export されている)は宣言名で一致させる。ClassSource から来る場合に使う。
// `exported` が false の宣言(export されていない)は export identity を持たないため、
// たまたま宣言名が一致しても候補にしない(レビュー再指摘6: 別クラスの export alias と
// 宣言名が同名になる場合の誤解決を防ぐ)
/** @throws {InspectFailure} */
const classDeclarationByExportName = async (
  state: State,
  filePath: string,
  exportName: string,
): Promise<ClassDeclLookup> => {
  const declarations = unwrapDep(await getClassDeclarationsCached(state, filePath));
  const decl = declarations.find((c) => c.exported && (c.exportName ?? c.name) === exportName);
  if (decl === undefined) {
    return failInspect({
      code: 'DECLARATION_NOT_FOUND',
      message: `Class declaration not found by export identity: ${exportName} in ${filePath}`,
    });
  }
  return declLookupResult(decl);
};

// 宣言名(AST上の識別子名)そのもので厳密に引く。internal-class ターゲットの `name` や
// FunctionRef.owner(いずれも常に宣言名。Task 1 設計判断メモ8)から来る場合に使う
/** @throws {InspectFailure} */
const classDeclarationByName = async (
  state: State,
  filePath: string,
  name: string,
): Promise<ClassDeclLookup> => {
  const declarations = unwrapDep(await getClassDeclarationsCached(state, filePath));
  const decl = declarations.find((c) => c.name === name);
  if (decl === undefined) {
    return failInspect({
      code: 'DECLARATION_NOT_FOUND',
      message: `Class declaration not found by name: ${name} in ${filePath}`,
    });
  }
  return declLookupResult(decl);
};

// root/依存クラスが external(node_modules 配下)なら ExternalNode を作り queue には積まない。
// internal なら ClassNode を作り(未訪問時のみ)queue に積む。設計判断メモ 3・4・10 を参照
// レビュー再指摘6: `source.exportName` に渡ってくる値の意味は呼び出し元によって異なる。
// 真の ClassSource(DI 解決・root・middleware)からの呼び出しは export identity であり
// `classDeclarationByExportName` で引く。一方 CallSiteTarget.internal の FunctionRef.owner・
// internal-class の name はどちらも常に宣言名(Task 1 設計)であり `classDeclarationByName` で
// 引く必要がある。両者を区別せず単一の find に頼ると、宣言名と別クラスの export alias が
// 同名になるケースで誤った宣言に解決しうるため、呼び出し元に lookup 方式を明示させる
/** @throws {InspectFailure} */
const seedClassOrExternal = async (
  state: State,
  source: ClassSource,
  lookup: 'export-name' | 'decl-name' = 'export-name',
): Promise<string> => {
  const pkg = packageFromPath(source.filePath);
  if (pkg !== undefined) {
    const pkgName = normalizePackageName(pkg.name);
    const id = externalNodeId(pkgName, source.exportName);
    if (!state.nodes.has(id)) {
      state.nodes.set(id, { id, external: true, package: pkgName, member: source.exportName });
    }
    return id;
  }
  const filePath = state.formatPath(source.filePath);
  // ClassNode の id/name は宣言名で統一する(exportName ではない。レビュー指摘6)
  const {
    name: declName,
    loc,
    decorators,
  } = lookup === 'export-name'
    ? await classDeclarationByExportName(state, source.filePath, source.exportName)
    : await classDeclarationByName(state, source.filePath, source.exportName);
  const id = classNodeId(filePath, declName);
  if (!state.visitedClasses.has(id)) {
    state.visitedClasses.add(id);
    state.nodes.set(id, {
      id,
      kind: 'class',
      name: declName,
      filePath,
      module: moduleOf(filePath),
      fileKind: fileKindOf(filePath),
      decorators: decorators.map((d) => d.name),
      loc,
    });
    state.queue.push({ kind: 'class', source, declName });
  }
  return id;
};

// レビュー指摘8: decorator の引数は文字列名ではなく ClassSource(TypeChecker 解決済み)で
// 比較する(import 別名対策)
const sameClassSource = (a: ClassSource, b: ClassSource): boolean =>
  a.filePath === b.filePath && a.exportName === b.exportName;

// @UseMiddleware(X) の X をこの decorator リストの中から ClassSource 一致で探し、その行を返す。
// 同じクラス/メソッドに複数の @UseMiddleware があっても、args でどの occurrence から来た
// middleware かを一意に決められる(宣言順の位置対応には頼らない。team-lead 決定)。
// team-lead 決定(Task 10 ブロッカーA): `@RateLimit` のような decorator ファクトリ経由の
// 適用は AST 上 literal な `UseMiddleware` という名前を持たないため、ここでは見つからなくても
// fail せず undefined を返す(呼び出し元 appliedMiddlewareLine が mw.line への
// フォールバックを試みてから、それも無ければ fail する)
const decoratorLineFor = (
  decorators: readonly DecoratorInfo[],
  middlewareSource: ClassSource,
): number | undefined =>
  decorators.find(
    (d) =>
      d.name === 'UseMiddleware' && d.args.some((arg) => sameClassSource(arg, middlewareSource)),
  )?.line;

// レビュー再指摘5: GraphRootV3.source/AppliedMiddlewareV3.source は必須フィールドになった
// (ClassSource 解決に失敗した場合は Task 9 が fatal にするため、ここに未解決のまま
// 到達することはない)。undefined チェック自体が不要になった
/** @throws {InspectFailure} */
const appliedMiddlewareLine = async (
  state: State,
  root: GraphRootV3,
  mw: AppliedMiddlewareV3,
): Promise<number> => {
  const rootFilePath = root.source.filePath;
  const astLine =
    mw.methods === undefined
      ? // root.className は宣言名(Task 9 の root 収集が decorator-metadata の反射から得る値、
        // export 名ではない)なので宣言名で引く(レビュー再指摘6)
        decoratorLineFor(
          (await classDeclarationByName(state, rootFilePath, root.className)).decorators,
          mw.source,
        )
      : decoratorLineFor(
          unwrapDep(await getFunctionDeclarationsCached(state, rootFilePath)).find(
            (f) =>
              f.ref.kind === 'method' &&
              f.ref.owner === root.className &&
              f.ref.name === mw.methods?.[0],
          )?.decorators ?? [],
          mw.source,
        );
  if (astLine !== undefined) return astLine;
  // AST 上 literal な `@UseMiddleware(X)` が見つからない場合(`@RateLimit` のような
  // decorator ファクトリ経由の適用)、analyzer-entry.ts が実行時 stack trace から解決した
  // 位置(mw.line)にフォールバックする(team-lead 決定。ブロッカーA参照)
  if (mw.line !== undefined) return mw.line;
  return failInspect({
    code: 'DECLARATION_NOT_FOUND',
    message: `No @UseMiddleware(...) decorator referencing ${mw.source.exportName} (${mw.source.filePath}) was found, and no runtime-resolved position was available either`,
  });
};

// ─── root の seed(entry hint の登録・injects/applies-middleware の DI 展開起点) ───

// レビュー指摘9: 同一メソッドに2つの route decorator が付いている場合、Map 構築で
// 後勝ちに黙って上書きされていた。entry は単数のフィールドのため、この場合は
// MULTIPLE_ENTRIES として fail する(9節: 未決事項を黙って解消しない)。
// seedRoot からの抽出(複雑度低減。ロジック自体はブリーフのまま)
/** @throws {BuildGraphFailure} */
const applyRouteEntryHints = (state: State, id: string, root: GraphRootV3): void => {
  if (root.routes === undefined || root.routes.length === 0) return;
  const routesByHandler = new Map<string, RouteInfoLike>();
  for (const route of root.routes) {
    if (routesByHandler.has(route.handler)) {
      // fail は never を返して throw するため、void 関数内では return を付けない
      fail({
        code: 'MULTIPLE_ENTRIES',
        message: `Multiple routes map to the same handler ${root.className}.${route.handler}`,
      });
    }
    routesByHandler.set(route.handler, route);
  }
  state.entryHints.set(id, { ...state.entryHints.get(id), routesByHandler });
};

// seedRoot からの抽出(複雑度低減)
/** @throws {InspectFailure} */
const applyAppliedMiddlewares = async (
  state: State,
  id: string,
  root: GraphRootV3,
): Promise<void> => {
  for (const mw of root.appliedMiddlewares ?? []) {
    const mwId = await seedClassOrExternal(state, mw.source);
    // @UseMiddleware(...) で参照されるだけのクラス(グローバル middleware のように roots に
    // 含まれない)は seedRoot を通らないため、そこでの isMiddleware 判定を受けない。
    // applies-middleware の宛先自身についてもここで同じ判定をしないと、その use() が
    // entry: { kind: 'middleware' } を持てなくなる(seedRoot と同じロジック)
    if (decoratorsOfClassNode(state, mwId).includes('Middleware')) {
      state.entryHints.set(mwId, { ...state.entryHints.get(mwId), isMiddleware: true });
    }
    const line = await appliedMiddlewareLine(state, root, mw);
    addEdge(state, {
      kind: 'applies-middleware',
      from: id,
      to: mwId,
      line,
      ...(mw.methods !== undefined ? { methods: mw.methods } : {}),
    });
  }
};

/** @throws {InspectFailure | BuildGraphFailure} */
const seedRoot = async (state: State, root: GraphRootV3): Promise<void> => {
  const id = await seedClassOrExternal(state, root.source);
  const seeded = state.nodes.get(id);
  if (seeded !== undefined && isExternalNode(seeded)) return; // external root は関数列挙の対象外

  applyRouteEntryHints(state, id, root);
  if (decoratorsOfClassNode(state, id).includes('Middleware')) {
    state.entryHints.set(id, { ...state.entryHints.get(id), isMiddleware: true });
  }
  await applyAppliedMiddlewares(state, id, root);
};

// ─── class work item の処理: injects エッジの展開 + そのファイルの関数列挙 ───

/** @throws {InspectFailure} */
const processInjectDependencies = async (
  state: State,
  item: Extract<WorkItem, { kind: 'class' }>,
): Promise<void> => {
  // レビュー指摘6: fromId は item.declName(宣言名)で組み立てる。item.source.exportName
  // (import identity)を使うと、default export/aliased export のクラスで
  // seedClassOrExternal が実際に作った ClassNode.id(宣言名ベース)と食い違う
  const fromId = classNodeId(state.formatPath(item.source.filePath), item.declName);
  const result = unwrapDep(await state.deps.resolveDependencies(item.source));
  if (result.kind !== 'resolved') return; // external/unresolved はここでは既に処理済みか対象外
  for (const dep of result.deps) {
    if (dep.kind === 'unresolved') continue; // v3 は unresolved 依存の representation を持たない(設計判断メモ参照)
    const depId = await seedClassOrExternal(state, dep.source);
    addEdge(state, { kind: 'injects', from: fromId, to: depId, line: dep.line });
  }
};

// レビュー指摘9: 同名 getter/setter 等、同じ owner+name の宣言が2件列挙されると
// 同じ FnNode.id が2回生成されることになる(未検証・未対応の9節ケースが実際に起きた場合)。
// 2件目を黙ってスキップせず fail する
/** @throws {InspectFailure | BuildGraphFailure} */
const enqueueFunctionsOfClass = async (
  state: State,
  filePath: string,
  className: string,
): Promise<void> => {
  const declarations = unwrapDep(await getFunctionDeclarationsCached(state, filePath));
  const seenIds = new Set<string>();
  for (const decl of declarations) {
    if (decl.ref.kind !== 'method' || decl.ref.owner !== className) continue;
    const id = idOfRef(state, decl.ref);
    if (seenIds.has(id)) {
      return fail({ code: 'DUPLICATE_NODE_ID', message: `Duplicate FnNode id: ${id}` });
    }
    seenIds.add(id);
    // レビュー指摘12: enqueuedFunctions への記録込みの scheduleFunction を使い、
    // 他の呼び出し元(processCallTarget 等)からの多重 enqueue も防ぐ
    scheduleFunction(state, decl.ref);
  }
};

/** @throws {InspectFailure | BuildGraphFailure} */
const processClassItem = async (
  state: State,
  item: Extract<WorkItem, { kind: 'class' }>,
): Promise<void> => {
  await processInjectDependencies(state, item);
  // レビュー指摘6: FunctionRef.owner は宣言名(Task 1 設計)のため、className フィルタも
  // item.declName(宣言名)で行う。item.source.exportName だと default export/aliased export
  // のクラスで一致せず、メソッドが1件も列挙されなくなる
  await enqueueFunctionsOfClass(state, item.source.filePath, item.declName);
};

// ─── function work item の処理: FnNode 生成 + 呼び出しサイトの解決 ───

// entryOf からの抽出(複雑度低減。ロジック自体はブリーフのまま)
const httpEntryOf = (
  hints: ClassEntryHints | undefined,
  ref: Extract<FunctionRef, { kind: 'method' }>,
): EntryInfo | undefined => {
  const route = hints?.routesByHandler?.get(ref.name);
  return route === undefined ? undefined : { kind: 'http', method: route.method, path: route.path };
};

const middlewareEntryOf = (
  hints: ClassEntryHints | undefined,
  ref: Extract<FunctionRef, { kind: 'method' }>,
): EntryInfo | undefined =>
  hints?.isMiddleware === true && ref.name === 'use'
    ? { kind: 'middleware', name: ref.owner }
    : undefined;

// レビュー元の brief では第3引数に FunctionDeclarationInfo を受けていたが、entry の判定は
// ref(owner/name)と routeHints/isMiddleware だけで決まり decl を一切参照しないため、
// 未使用パラメータを避けるために削った(呼び出し元の createFnNode も合わせて更新)
const entryOf = (state: State, ref: FunctionRef): EntryInfo | undefined => {
  if (ref.kind !== 'method') return undefined;
  const classId = classNodeId(state.formatPath(ref.filePath), ref.owner);
  const hints = state.entryHints.get(classId);
  return httpEntryOf(hints, ref) ?? middlewareEntryOf(hints, ref);
};

// findDeclaration の述語を分離(複雑度低減。ロジック自体はブリーフのまま)
const sameFunctionRef = (a: FunctionRef, b: FunctionRef): boolean => {
  if (a.kind === 'method' && b.kind === 'method') return a.owner === b.owner && a.name === b.name;
  return a.kind === 'function' && b.kind === 'function' && a.name === b.name;
};

// レビュー指摘5: FunctionRef は get/set accessor を区別しない(collectedFunctionRef が
// 両方に同じ {kind:'method', owner, name} を割り当てる。design memo 12 の未対応ケース)。
// 同名の get/set が共存すると getFunctionDeclarations の列挙結果にこの ref に一致する宣言が
// 2件現れる。黙って先勝ちで選ばず、呼び出し元(createFnNode)が not-found/ambiguous/found を
// 明示的に分岐できるよう一致件数を含めて返す
type FindDeclarationResult =
  | { kind: 'not-found' }
  | { kind: 'ambiguous'; readonly count: number }
  | { kind: 'found'; readonly decl: FunctionDeclarationInfo };

const findDeclaration = (
  declarations: readonly FunctionDeclarationInfo[],
  ref: FunctionRef,
): FindDeclarationResult => {
  const matches = declarations.filter((d) => sameFunctionRef(d.ref, ref));
  // noUncheckedIndexedAccess: 配列インデックスアクセスを避け、分割代入で先頭2件を見る
  const [first, second] = matches;
  if (first === undefined) return { kind: 'not-found' };
  if (second !== undefined) return { kind: 'ambiguous', count: matches.length };
  return { kind: 'found', decl: first };
};

const decoratorsOf = (
  state: State,
  ref: FunctionRef,
  own: readonly DecoratorInfo[],
): readonly string[] => {
  if (ref.kind !== 'method') return []; // モジュール関数の decorators は常に []
  const classId = classNodeId(state.formatPath(ref.filePath), ref.owner);
  return [...decoratorsOfClassNode(state, classId), ...own.map((d) => d.name)];
};

const idOfRef = (state: State, ref: FunctionRef): string =>
  fnNodeId(state.formatPath(ref.filePath), ref.kind === 'method' ? ref.owner : undefined, ref.name);

// レビュー指摘12: 関数をキューに積む3箇所(processCallTarget の internal 分岐・
// enqueueFunctionsOfClass・root の functionRoots 初期投入)を1箇所に集約し、
// push 前に enqueuedFunctions へ記録することで多重 enqueue を防ぐ
const scheduleFunction = (state: State, ref: FunctionRef): void => {
  const id = idOfRef(state, ref);
  if (state.enqueuedFunctions.has(id) || state.nodes.has(id)) return;
  state.enqueuedFunctions.add(id);
  state.queue.push({ kind: 'function', ref });
};

// レビュー指摘8: 呼び出し解決で見つかった FunctionRef が、getFunctionDeclarations の
// 列挙結果に無いのは矛盾(呼び出し解決自体が in-program の宣言から作った ref のはず)。
// visibility/loc の 'public'/{0,0} フォールバックは廃止し、fail する
/** @throws {InspectFailure | BuildGraphFailure} */
const createFnNode = async (state: State, ref: FunctionRef): Promise<string> => {
  const id = idOfRef(state, ref);
  const declarations = unwrapDep(await getFunctionDeclarationsCached(state, ref.filePath));
  const found = findDeclaration(declarations, ref);
  if (found.kind === 'ambiguous') {
    return fail({
      code: 'DUPLICATE_NODE_ID',
      message: `${found.count} function declarations map to the same FnNode id ${id} (e.g. a get/set accessor pair sharing a name)`,
    });
  }
  if (found.kind === 'not-found') {
    return failInspect({
      code: 'DECLARATION_NOT_FOUND',
      message: `Function declaration not found for ${id}`,
    });
  }
  const decl = found.decl;
  const filePath = state.formatPath(ref.filePath);
  const contract = unwrapDep(await state.deps.getFunctionSignature(ref));
  const entry = entryOf(state, ref);
  state.nodes.set(id, {
    id,
    name: ref.name,
    ...(ref.kind === 'method' ? { owner: ref.owner } : {}),
    filePath,
    module: moduleOf(filePath),
    fileKind: fileKindOf(filePath),
    decorators: decoratorsOf(state, ref, decl.decorators),
    ...(entry !== undefined ? { entry } : {}),
    contract,
    visibility: decl.visibility,
    loc: decl.loc,
  });
  return id;
};

// processCallTarget の internal 分岐の抽出(複雑度低減。ロジック自体はブリーフのまま)
/** @throws {InspectFailure} */
const processInternalCallTarget = async (
  state: State,
  target: Extract<CallSiteTarget, { kind: 'internal' }>,
): Promise<{ readonly to: string }> => {
  // レビュー指摘3: internal メソッドを呼び出し解決で発見したら、owner クラス(非 export でも)を
  // 先に class work item として seed する(ClassNode 不在の FnNode を作らない。DI 依存も
  // 展開されるようになる)。super.method() で見つかる基底クラスも同じ経路で扱われる
  if (target.ref.kind === 'method') {
    // target.ref.owner は宣言名(Task 1 設計)であり export identity ではないため、
    // 'decl-name' lookup を明示する(レビュー再指摘6)
    await seedClassOrExternal(
      state,
      { filePath: target.ref.filePath, exportName: target.ref.owner },
      'decl-name',
    );
  }
  const toId = idOfRef(state, target.ref);
  scheduleFunction(state, target.ref); // レビュー指摘12: enqueue 時点で記録し多重 enqueue を防ぐ
  return { to: toId };
};

// processCallTarget の external 分岐の抽出(複雑度低減。ロジック自体はブリーフのまま)
const processExternalCallTarget = (
  state: State,
  fromId: string,
  target: Extract<CallSiteTarget, { kind: 'external' }>,
  site: CallSite,
): { readonly to: string } => {
  const pkgName = normalizePackageName(target.package);
  const toId = externalNodeId(pkgName, target.member);
  if (!state.nodes.has(toId)) {
    state.nodes.set(toId, { id: toId, external: true, package: pkgName, member: target.member });
  }
  if (isEmitCandidate(target, site.firstArgLiteral) && site.firstArgLiteral !== undefined) {
    state.emitCandidates.push({
      from: fromId,
      event: site.firstArgLiteral,
      line: site.line,
      column: site.column,
    });
  }
  const isSubscribe = state.deps.isSubscribeCandidate ?? defaultIsSubscribeCandidate;
  if (isSubscribe(target, site.firstArgLiteral) && site.firstArgLiteral !== undefined) {
    state.subscribeCandidates.push({
      event: site.firstArgLiteral,
      to: fromId,
      line: site.line,
      column: site.column,
    });
  }
  return { to: toId };
};

/** @throws {InspectFailure} */
const processCallTarget = async (
  state: State,
  fromId: string,
  site: CallSite,
): Promise<{ readonly to: string } | undefined> => {
  const target = site.target;
  if (target.kind === 'unresolved') return undefined; // unresolvedCalls 側で扱う(呼び出し元で処理)
  if (target.kind === 'internal') return processInternalCallTarget(state, target);
  if (target.kind === 'internal-class') {
    // new X() で X が internal クラス。target.name は宣言名(spec 5(c)・設計判断メモ2)
    // であり export identity ではないため、'decl-name' lookup を明示する(レビュー再指摘6)。
    // これにより internal-class 由来のクラスも injects/関数列挙が通常どおり展開される
    const toId = await seedClassOrExternal(
      state,
      { filePath: target.filePath, exportName: target.name },
      'decl-name',
    );
    return { to: toId };
  }
  return processExternalCallTarget(state, fromId, target, site);
};

// entry の内容比較(EntryInfo は primitive フィールドのみの小さな判別共用体のため
// JSON.stringify の等値比較で十分。Task 10 の診断スクリプトと同じ考え方)
const sameEntry = (a: EntryInfo, b: EntryInfo): boolean => JSON.stringify(a) === JSON.stringify(b);

// applyEventEntryIfSubscribed からの抽出(複雑度低減。ロジック自体はブリーフのまま)
const existingEntryOf = (node: GraphNodeV3): EntryInfo | undefined =>
  match(node)
    .with({ kind: 'class' }, () => undefined) // ClassNode/ExternalNode に entry は無い
    .with({ external: true }, () => undefined)
    .otherwise((fn) => fn.entry);

// applyEventEntryIfSubscribed からの抽出(複雑度低減)。レビュー再指摘4: 以前は「既に entry が
// あれば(http/middleware でも event でも)後続候補を黙って無視する」先勝ちだったが、これは
// MULTIPLE_ENTRIES の方針(9節: 黙って解消しない)と矛盾する。route/middleware entry と
// event entry の競合、複数 event への同時 subscribe のどちらも「1関数に単一の entry」という
// 前提が崩れた実データであり、fail する
/** @throws {BuildGraphFailure} */
const recordEventEntry = (
  state: State,
  node: GraphNodeV3,
  fnId: string,
  newEntry: EntryInfo,
): void => {
  const existingEntry = existingEntryOf(node);
  if (existingEntry === undefined) {
    state.nodes.set(fnId, { ...node, entry: newEntry });
    return;
  }
  if (sameEntry(existingEntry, newEntry)) return; // 同一 entry の重複登録は冪等に許容する
  // fail は never を返して throw するため、void 関数内では return を付けない
  fail({
    code: 'MULTIPLE_ENTRIES',
    message: `Function ${fnId} has conflicting entries: ${JSON.stringify(existingEntry)} vs ${JSON.stringify(newEntry)}`,
  });
};

/** @throws {BuildGraphFailure} */
const applyEventEntryIfSubscribed = (state: State, fnId: string, site: CallSite): void => {
  const target = site.target;
  if (target.kind === 'unresolved' || site.firstArgLiteral === undefined) return;
  const isSubscribe = state.deps.isSubscribeCandidate ?? defaultIsSubscribeCandidate;
  if (!isSubscribe(target, site.firstArgLiteral)) return;
  const node = state.nodes.get(fnId);
  if (node === undefined) return;
  recordEventEntry(state, node, fnId, { kind: 'event', event: site.firstArgLiteral });
};

// processFunctionItem のループ本体の抽出(複雑度低減。ロジック自体はブリーフのまま)
/** @throws {InspectFailure | BuildGraphFailure} */
const processCallSite = async (
  state: State,
  fnId: string,
  site: CallSite,
  unresolved: UnresolvedCall[],
): Promise<void> => {
  if (site.target.kind === 'unresolved') {
    unresolved.push({
      line: site.line,
      expression: site.target.expression,
      reason: site.target.reason,
    });
    return;
  }
  const resolved = await processCallTarget(state, fnId, site);
  if (resolved === undefined) return;
  addEdge(
    state,
    {
      kind: 'calls',
      from: fnId,
      to: resolved.to,
      context: site.context,
      awaited: site.awaited,
      line: site.line,
    },
    String(site.column), // レビュー指摘12: 同一行・別列の呼び出しを別辺として扱う
  );
  applyEventEntryIfSubscribed(state, fnId, site);
};

/** @throws {InspectFailure | BuildGraphFailure} */
const processFunctionItem = async (
  state: State,
  item: Extract<WorkItem, { kind: 'function' }>,
): Promise<void> => {
  const fnId = idOfRef(state, item.ref);
  if (state.visitedFunctions.has(fnId)) return;
  state.visitedFunctions.add(fnId);
  if (!state.nodes.has(fnId)) await createFnNode(state, item.ref);

  const sites = unwrapDep(await state.deps.getCallSites(item.ref));
  const unresolved: UnresolvedCall[] = [];
  for (const site of sites) await processCallSite(state, fnId, site, unresolved);
  if (unresolved.length > 0) {
    const node = state.nodes.get(fnId);
    if (node !== undefined) state.nodes.set(fnId, { ...node, unresolvedCalls: unresolved });
  }
};

/** @throws {InspectFailure | BuildGraphFailure} */
const drainQueue = async (state: State): Promise<void> => {
  for (let item = state.queue.shift(); item !== undefined; item = state.queue.shift()) {
    if (item.kind === 'class') {
      await processClassItem(state, item);
    } else {
      await processFunctionItem(state, item);
    }
  }
};

// レビュー再指摘10: emit/subscribe それぞれの occurrence(line+column)を辺重複排除キーに
// 含める。addEdge のキーは edge.line(= emit.line)しか見ないため、emit.column・
// sub.line・sub.column も dedupSuffix に含めないと、同じ column の subscribe 呼び出しが
// 複数行にあるケース(例: 同じ列に揃えて書かれた2つの `this.bus.on('x', …)`)で
// 片方が誤って重複排除されてしまう(レビュー修正: emit/sub 双方の occurrence 全体を
// キーにする)。JSON に出す EventEdge 自体には(CallsEdge と同じ理由で)column を含めない
type EventEdgeCandidate = { readonly edge: GraphEdgeV3; readonly dedupSuffix: string };

const buildEventEdges = (state: State): readonly EventEdgeCandidate[] => {
  const results: EventEdgeCandidate[] = [];
  for (const emit of state.emitCandidates) {
    for (const sub of state.subscribeCandidates) {
      if (sub.event !== emit.event) continue;
      results.push({
        edge: { kind: 'event', from: emit.from, to: sub.to, event: emit.event, line: emit.line },
        dedupSuffix: `${emit.line}:${emit.column}:${sub.line}:${sub.column}`,
      });
    }
  }
  return results;
};

// レビュー指摘2: zelt.config.ts の app factory(例: createEcApp)はどのクラスの DI からも
// 到達しない孤立した関数 root であり、GraphRootV3(クラス起点)とは別に「関数そのものを
// root として queue に積む」経路が要る
/** @throws {InspectFailure | BuildGraphFailure} */
const buildDependencyGraphUnsafe = async (
  roots: readonly GraphRootV3[],
  deps: BuildGraphV3Deps,
  functionRoots: readonly FunctionRef[] | undefined,
): Promise<DependencyGraph> => {
  const state: State = {
    nodes: new Map(),
    edgeKeys: new Set(),
    edges: [],
    queue: [],
    visitedClasses: new Set(),
    visitedFunctions: new Set(),
    enqueuedFunctions: new Set(),
    entryHints: new Map(),
    formatPath: deps.formatPath ?? ((filePath) => filePath),
    deps,
    emitCandidates: [],
    subscribeCandidates: [],
    functionDeclCache: new Map(),
    classDeclCache: new Map(),
  };

  for (const root of roots) await seedRoot(state, root);
  // レビュー指摘12: functionRoots も scheduleFunction 経由にし、traversal で既に
  // 発見済み(または他の functionRoots で先に enqueue 済み)の関数を多重 enqueue しない
  for (const ref of functionRoots ?? []) scheduleFunction(state, ref);
  await drainQueue(state);
  for (const { edge, dedupSuffix } of buildEventEdges(state)) addEdge(state, edge, dedupSuffix);

  return { version: 3, nodes: [...state.nodes.values()], edges: state.edges, tests: [] };
};

// 逸脱: ブリーフは `ResultAsyncCtor.fromPromise(buildDependencyGraphUnsafe(...), mapError)` を
// 指定していたが、`@9wick/strict-type-rules/restrict-neverthrow-from-promise` は
// fromPromise() の第一引数がローカル定義関数の呼び出しであることを禁止する(「その関数自体が
// ResultAsync を返すように」という設計原則を機械的に強制するルール)。worklist アルゴリズム
// 自体を Result チェーンに書き換えるのは本タスクの意図的な設計(素朴な async/await + throw)
// に反し出力が大きすぎるため、代わりに class-source.lib.ts の importModule と同じ
// 確立済みイディオム(reject しない Promise に自前で畳んでから fromSafePromise で持ち上げる)
// を使う。buildDependencyGraphUnsafe 自体は reject しうる素朴な async 関数のままにし、
// ここで try/catch により reject しない BuildOutcome に一度だけ畳む
// (このリポジトリは no-throw/no-try-catch を全体で許可済み)
type BuildOutcome =
  | { ok: true; readonly graph: DependencyGraph }
  | { ok: false; readonly error: BuildGraphError | InspectError | ProgramCacheError };

const toUnexpectedError = (error: unknown): BuildGraphError => ({
  code: 'UNEXPECTED_ERROR',
  message: error instanceof Error ? error.message : String(error),
  cause: error,
});

// throw-trace の try-catch 捕捉検出(instanceof narrowing のみを「捕捉済み」と認識する)に
// 合わせ、InspectFailure/BuildGraphFailure の変換を catch 節に直接 instanceof で書く
// (以前は別関数 toBuildGraphErrorUnion に委譲していたが、呼び出し先内部の instanceof は
// 検出対象にならず、両クラスが未捕捉として buildDependencyGraph まで伝播していた)
const buildDependencyGraphOutcome = async (
  roots: readonly GraphRootV3[],
  deps: BuildGraphV3Deps,
  functionRoots: readonly FunctionRef[] | undefined,
): Promise<BuildOutcome> => {
  try {
    const graph = await buildDependencyGraphUnsafe(roots, deps, functionRoots);
    return { ok: true, graph };
  } catch (error) {
    if (error instanceof InspectFailure) return { ok: false, error: error.inspectError };
    if (error instanceof BuildGraphFailure) return { ok: false, error: error.buildGraphError };
    return { ok: false, error: toUnexpectedError(error) };
  }
};

// レビュー再指摘(エラー体系の統一): InspectFailure(inspect 層由来の失敗)は
// BuildGraphError に包み直さず、運ばれてきた InspectError | ProgramCacheError をそのまま返す
export const buildDependencyGraph = (
  roots: readonly GraphRootV3[],
  deps: BuildGraphV3Deps,
  functionRoots?: readonly FunctionRef[],
): ResultAsync<DependencyGraph, BuildGraphError | InspectError | ProgramCacheError> =>
  ResultAsyncCtor.fromSafePromise(buildDependencyGraphOutcome(roots, deps, functionRoots)).andThen(
    (outcome) => (outcome.ok ? ok(outcome.graph) : err(outcome.error)),
  );
