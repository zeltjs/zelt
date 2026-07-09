import type { ClassSource } from '@zeltjs/decorator-metadata/inspect';

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
  // undefined = ClassSource へ変換できない（unresolved ノードになる）
  readonly source: ClassSource | undefined;
  readonly kind: GraphNodeKind;
  readonly featureKey: string;
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
