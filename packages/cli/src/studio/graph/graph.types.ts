import type { ClassSource } from '@zeltjs/decorator-metadata/inspect';

export type GraphNodeKind =
  | 'controller'
  | 'command'
  | 'config'
  | 'middleware'
  | 'error-handler'
  | 'service';

export type GraphEdgeKind = 'injects' | 'applies-middleware';

export type GraphEdge = {
  readonly from: string;
  readonly to: string;
  readonly kind: GraphEdgeKind;
  // applies-middleware かつ method-level 適用のみ: 対象メソッド名。class-level は undefined
  readonly methods?: readonly string[];
};

// path は Controller の basePath 結合済み fullPath
export type RouteInfo = {
  readonly method: string;
  readonly path: string;
  readonly handler: string;
};

// inspect 層の PublicMethodSignature と構造同一。グラフ JSON のスキーマは studio が所有する
export type MethodSignature = {
  readonly name: string;
  readonly params: readonly { readonly name: string; readonly type: string }[];
  readonly returnType: string;
};

export type GraphNode = {
  readonly id: string;
  readonly className: string;
  // 契約: posix 区切り('/')。UI 側が split('/') 前提のため analyzer 側で正準化済み
  readonly filePath: string;
  readonly kind: GraphNodeKind;
  // 起点クラスのみ: 属する feature の key（例: 'http'）。inject で発見した依存ノードには付かない
  readonly featureKey?: string;
  readonly decorators?: readonly string[];
  readonly routes?: readonly RouteInfo[];
  // instance public メソッドの契約。external / unresolved ノードには無い
  readonly contract?: readonly MethodSignature[];
  unresolved?: true;
};

// AI対話→実装適用パイプラインの一級成果物。破壊的変更時は version を上げる
export type DependencyGraph = {
  version: 2;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
};

// @UseMiddleware 由来の適用 1 件分。source undefined = ClassSource 変換不能（unresolved ノードになる）
export type AppliedMiddleware = {
  readonly className: string;
  readonly source: ClassSource | undefined;
  readonly decorators: readonly string[];
  readonly methods?: readonly string[];
};

export type GraphRoot = {
  readonly className: string;
  // undefined = ClassSource へ変換できない（unresolved ノードになる）
  readonly source: ClassSource | undefined;
  readonly kind: GraphNodeKind;
  readonly featureKey: string;
  readonly decorators: readonly string[];
  readonly routes?: readonly RouteInfo[];
  readonly appliedMiddlewares?: readonly AppliedMiddleware[];
};

// resolver が返す 1 依存分。'class' の source は decorator-metadata 側で
// 実クラス経由に正準化済みのため、root 由来のノードと文字列比較だけで合流できる
export type DependencyResolution =
  | {
      kind: 'class';
      readonly source: ClassSource;
      readonly decorators: readonly string[];
    }
  | { kind: 'unresolved'; readonly localName: string };

// TS AST 解析の副作用はこの境界の外に隔離する。
// external = 依存展開の対象外（node_modules 等、program に含まれないソース）でエラーではない。
// unresolved = そのクラスのみ解析不能（理由のログ出力は resolver 実装側の責務）。
// tsconfig 異常など全体に波及するエラーは resolver が throw して fatal に扱う
export type ResolveResult =
  | { kind: 'resolved'; readonly deps: readonly DependencyResolution[] }
  | { kind: 'external' }
  | { kind: 'unresolved' };

export type DependencyResolver = (source: ClassSource) => Promise<ResolveResult>;

// 契約抽出の副作用境界。external は resolver が先に弾くため、ここでの失敗は fatal(throw)
export type ContractResolver = (source: ClassSource) => Promise<readonly MethodSignature[]>;
