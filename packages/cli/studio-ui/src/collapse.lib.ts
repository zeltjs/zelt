import type { DependencyGraph, GraphEdgeKind, GraphNode } from '../../src/studio/graph/graph.types';

// filePath はファイル単位、グループはディレクトリ単位。"(unknown)" は
// スラッシュを含まないため自身がグループ key になり、まとまって表示される
export const dirOf = (filePath: string): string => {
  const parts = filePath.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : filePath;
};

// card node の id（クラス由来の任意文字列）と衝突しないよう prefix する
export const groupIdOf = (dir: string): string => `folder:${dir}`;

// pnpm の node_modules/.pnpm/<hash>/node_modules/<pkg> はハッシュでノードが埋まり読めなくなるため、
// 表示専用にパッケージ名だけへ短縮する。グルーピング key は dir のフルパスのまま変えない
export const displayDirLabel = (dir: string): string => {
  const segments = dir.split('/');
  const lastNodeModulesIndex = segments.lastIndexOf('node_modules');
  if (lastNodeModulesIndex === -1) return dir;

  const after = segments.slice(lastNodeModulesIndex + 1);
  if (after.length === 0) return dir;

  // scoped package (@scope/name) は 2 segment、それ以外は 1 segment がパッケージ名
  const packageSegmentCount = after[0]?.startsWith('@') ? 2 : 1;
  return after.slice(0, packageSegmentCount).join('/');
};

export type AggregatedEdge = {
  readonly from: string;
  readonly to: string;
  readonly kind: GraphEdgeKind;
  readonly count: number;
};

export type CollapsedView = {
  readonly visibleNodes: readonly GraphNode[];
  readonly collapsedGroups: readonly { readonly dir: string; readonly memberCount: number }[];
  readonly edges: readonly AggregatedEdge[];
};

// 折りたたみ対象 dir に属するノードはグループ id に丸め込み、それ以外はそのまま素通しする
const endpointOf = (
  nodeId: string,
  dirById: ReadonlyMap<string, string>,
  collapsedDirs: ReadonlySet<string>,
): string => {
  const dir = dirById.get(nodeId);
  return dir !== undefined && collapsedDirs.has(dir) ? groupIdOf(dir) : nodeId;
};

// 丸め込みで両端が同一グループになったエッジのみ自己ループとして除去する。
// 元から from === to のエッジ(将来のエッジ種別で発生しうる)は表示対象として残す
const aggregateEdges = (
  edges: DependencyGraph['edges'],
  dirById: ReadonlyMap<string, string>,
  collapsedDirs: ReadonlySet<string>,
): readonly AggregatedEdge[] => {
  const aggregated = new Map<string, AggregatedEdge>();
  for (const edge of edges) {
    const from = endpointOf(edge.from, dirById, collapsedDirs);
    const to = endpointOf(edge.to, dirById, collapsedDirs);
    const remapped = from !== edge.from || to !== edge.to;
    if (remapped && from === to) continue;
    const key = `${from}->${to}#${edge.kind}`;
    const existing = aggregated.get(key);
    aggregated.set(
      key,
      existing
        ? { ...existing, count: existing.count + 1 }
        : { from, to, kind: edge.kind, count: 1 },
    );
  }
  return Array.from(aggregated.values());
};

// dagre レイアウトの外で使う純粋なビュー変換: 折りたたみ dir のノードを単一グループへ集約し、
// エッジは丸め込み後の (from, to, kind) 単位で集約する。グラフ JSON 自体は変更しない
export const collapseView = (
  graph: DependencyGraph,
  collapsedDirs: ReadonlySet<string>,
): CollapsedView => {
  const dirById = new Map(graph.nodes.map((node) => [node.id, dirOf(node.filePath)]));

  // グラフに存在しない dir が collapsedDirs に含まれていても member 0 のため自然に無視される
  const memberCountByDir = new Map<string, number>();
  for (const dir of dirById.values()) {
    if (!collapsedDirs.has(dir)) continue;
    memberCountByDir.set(dir, (memberCountByDir.get(dir) ?? 0) + 1);
  }
  const collapsedGroups = Array.from(memberCountByDir.entries()).map(([dir, memberCount]) => ({
    dir,
    memberCount,
  }));

  const visibleNodes = graph.nodes.filter((node) => !collapsedDirs.has(dirById.get(node.id) ?? ''));

  return {
    visibleNodes,
    collapsedGroups,
    edges: aggregateEdges(graph.edges, dirById, collapsedDirs),
  };
};
