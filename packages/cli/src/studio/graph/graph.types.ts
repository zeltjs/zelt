export type GraphNodeKind =
  | 'controller'
  | 'command'
  | 'config'
  | 'middleware'
  | 'error-handler'
  | 'service';

export type GraphNode = {
  readonly id: string;
  readonly className: string;
  readonly filePath: string;
  readonly kind: GraphNodeKind;
  // 起点クラスのみ: 属する feature の key（例: 'http'）。inject で発見した依存ノードには付かない
  readonly featureKey?: string;
  unresolved?: true;
};

export type GraphEdge = {
  readonly from: string;
  readonly to: string;
};

// AI対話→実装適用パイプラインの一級成果物。破壊的変更時は version を上げる
export type DependencyGraph = {
  version: 1;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
};

export type GraphRoot = {
  readonly className: string;
  // undefined = ソース位置を特定できない（unresolved ノードになる）
  readonly filePath: string | undefined;
  readonly kind: GraphNodeKind;
  readonly featureKey: string;
};

export type ResolvedDependency = {
  readonly className: string;
  readonly filePath: string;
  readonly decorators: readonly string[];
};

// TS AST 解析の副作用はこの境界の外に隔離する。
// unresolved = そのクラスのみ解析不能（理由のログ出力は resolver 実装側の責務）。
// tsconfig 異常など全体に波及するエラーは resolver が throw して fatal に扱う
export type ResolveResult =
  | { kind: 'resolved'; readonly deps: readonly ResolvedDependency[] }
  | { kind: 'unresolved' };

export type DependencyResolver = (filePath: string, className: string) => Promise<ResolveResult>;
