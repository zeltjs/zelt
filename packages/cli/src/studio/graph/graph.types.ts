import type { ClassSource } from '@zeltjs/decorator-metadata/inspect';
// レビュー指摘9(層構造): このファイルは studio の v3 グラフ JSON スキーマの SSOT であり、
// inspect 層(decorator-metadata)の型をそのまま re-export/依存してはならない
// (v2 も同じ理由で型を再宣言していた。「別成果物を作らない」は JSON の形の話であり、
// 型定義ファイル自体の依存方向とは別の話)。CallContext/UnresolvedReason/FunctionContract を
// 構造的に同一のまま下で再宣言する。乖離チェック(末尾)は named import の as リネーム
// (@9wick/strict-type-rules/no-import-rename で禁止)にも namespace import
// (import-x/no-namespace で禁止)にも頼らず、`import('pkg').Type` というインライン型クエリ
// (import 文ではなく型位置の式なのでどちらのルールにも抵触しない)で inspect 側の型を直接参照する

export type Loc = { readonly start: number; readonly end: number }; // 1-based line

// inspect 層の CallContext/UnresolvedReason/FunctionContract と構造的に同一。
// import せず再宣言することで、studio の JSON スキーマの所有権をこのファイルに保つ
export type CallContext = 'try' | 'catch' | 'finally' | 'branch' | 'loop' | 'callback' | 'plain';

export type UnresolvedReason =
  | 'parameter-callback'
  | 'stored-function-reference'
  | 'dynamic-property-access'
  | 'symbol-unresolved';

export type FunctionContract = {
  readonly params: readonly { readonly name: string; readonly type: string }[];
  readonly returnType: string;
};

// 型レベルの相互代入可能性チェック(実行時コードは一切生成しない)。上の再宣言が
// inspect 層の実体と構造的に乖離したら、この行自体が typecheck エラーになることで気づける
// (AssertTrue<T extends true> は T が false になった時点で型引数の制約違反として失敗する)
type AssertTrue<T extends true> = T;
type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type _CallContextInSyncWithInspect = AssertTrue<
  IsExact<CallContext, import('@zeltjs/decorator-metadata/inspect').CallContext>
>;
type _UnresolvedReasonInSyncWithInspect = AssertTrue<
  IsExact<UnresolvedReason, import('@zeltjs/decorator-metadata/inspect').UnresolvedReason>
>;
type _FunctionContractInSyncWithInspect = AssertTrue<
  IsExact<FunctionContract, import('@zeltjs/decorator-metadata/inspect').FunctionContract>
>;

// クラスに属するメソッド、またはモジュールスコープの関数 1 つ分
export type FnNode = {
  // owner あり: `${filePath}#${owner}.${name}` / owner なし: `${filePath}#${name}`
  readonly id: string;
  readonly name: string;
  // 所属クラス名。ClassNode.name と一致(存在すれば同一ファイルに対応する ClassNode が必ずある)
  readonly owner?: string;
  // posix 区切り。zelt studio 実行時の cwd からの相対パス
  readonly filePath: string;
  // filePath の親ディレクトリ(filePath と同じ相対基準の posix パス)
  readonly module: string;
  // basename を '.' で分割した際の後ろから2番目のセグメント。3セグメント未満なら null
  readonly fileKind: string | null;
  // owner あり: [...クラス decorator(宣言順), ...メソッド decorator(宣言順)]
  // owner なし: 常に []
  readonly decorators: readonly string[];
  readonly entry?: EntryInfo;
  readonly contract: FunctionContract;
  // クラスメソッド: private/protected 修飾子の有無どおり。モジュール関数: export の
  // 有無で決める(export -> public, 非export -> private)
  readonly visibility: 'public' | 'private';
  readonly loc: Loc;
  // 解決不能だった呼び出し。無ければキー自体を省略
  readonly unresolvedCalls?: readonly UnresolvedCall[];
};

export type EntryInfo =
  | { kind: 'http'; readonly method: string; readonly path: string }
  | { kind: 'event'; readonly event: string }
  // name: ミドルウェアのクラス名(owner と同一値。entry 単体で自己記述にするため)
  | { kind: 'middleware'; readonly name: string };

export type UnresolvedCall = {
  readonly line: number;
  readonly expression: string;
  readonly reason: UnresolvedReason;
};

// クラス宣言そのもの。グラフの主体は FnNode であり、ClassNode は
// グルーピングと injects / applies-middleware の端点のための補助ノード
export type ClassNode = {
  readonly id: string; // `${filePath}#${name}`
  kind: 'class';
  readonly name: string;
  readonly filePath: string;
  readonly module: string;
  readonly fileKind: string | null;
  readonly decorators: readonly string[]; // 宣言順
  readonly loc: Loc;
};

export type ExternalNode = {
  readonly id: string; // `ext:${package}#${member}`
  external: true;
  readonly package: string;
  readonly member: string;
};

export type GraphNodeV3 = FnNode | ClassNode | ExternalNode;

export type InjectsEdge = {
  kind: 'injects';
  readonly from: string; // ClassNode.id
  readonly to: string; // ClassNode.id | ExternalNode.id
  readonly line: number;
};

export type AppliesMiddlewareEdge = {
  kind: 'applies-middleware';
  readonly from: string; // ClassNode.id
  readonly to: string; // ClassNode.id | ExternalNode.id
  readonly methods?: readonly string[];
  readonly line: number;
};

export type CallsEdge = {
  kind: 'calls';
  readonly from: string; // FnNode.id
  // FnNode.id | ExternalNode.id | ClassNode.id(internal な new X() の宛先のみ ClassNode.id)
  readonly to: string;
  readonly context: CallContext;
  readonly awaited: boolean;
  readonly line: number;
};

export type EventEdge = {
  kind: 'event';
  readonly from: string; // FnNode.id(emit を呼ぶ関数)
  readonly to: string; // FnNode.id(on/once を呼ぶ関数)
  readonly event: string;
  readonly line: number;
};

export type GraphEdgeV3 = InjectsEdge | AppliesMiddlewareEdge | CallsEdge | EventEdge;

export type TestCaseV3 = {
  readonly id: string; // `${filePath}#${describePath.join('/')}/${name}`
  readonly filePath: string;
  readonly describePath: readonly string[];
  readonly name: string;
  readonly covers: readonly {
    readonly target: string;
    readonly via: 'calls' | 'route';
  }[];
  readonly style: 'solitary' | 'sociable' | null;
};

// AI対話→実装適用パイプラインの一級成果物。破壊的変更時は version を上げる
export type DependencyGraph = {
  version: 3;
  readonly nodes: readonly GraphNodeV3[];
  readonly edges: readonly GraphEdgeV3[];
  readonly tests: readonly TestCaseV3[]; // 第3サブプロジェクトまでは常に []
};

// v2 の GraphRoot/AppliedMiddleware/DependencyResolution/ResolveResult/DependencyResolver/
// ContractResolver/RouteInfo/MethodSignature/GraphNodeKind/GraphEdgeKind/GraphEdge/GraphNode
// は Task 8 の build-graph.lib.ts 書き換えに伴い、このファイルから削除する(旧型は
// 一切残さない。decision 1「別成果物を作らない」により v2/v3 併存はしない)。
// ClassSource は Task 8 で root/依存の解決結果を受け取る際に引き続き使うため import を残す。
export type { ClassSource };
