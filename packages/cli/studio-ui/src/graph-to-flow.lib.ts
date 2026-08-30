import type { EdgeLabel, GraphLabel, NodeLabel } from '@dagrejs/dagre';
import dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';

import type { DependencyGraph, GraphEdge, GraphNode } from '../../src/studio/graph/graph.types';
import type { AggregatedEdge } from './collapse.lib';
import { collapseView, dirOf, displayDirLabel, groupIdOf } from './collapse.lib';

export type SavedPositions = Readonly<Record<string, { readonly x: number; readonly y: number }>>;

export type CardData = {
  readonly className: string;
  readonly filePath: string;
  readonly kind: GraphNode['kind'];
  readonly unresolved: boolean;
};

// label は表示用に短縮済み（displayDirLabel）、dir は折りたたみ操作やツールチップ用のフルパス
export type GroupData = { readonly label: string; readonly dir: string };

// 折りたたみグループを表す合成ノード。id はグループと共通の folder:<dir> のため positions が引き継がれる
export type ModuleData = {
  readonly label: string;
  readonly dir: string;
  readonly memberCount: number;
};

export type FlowNode =
  | Node<CardData, 'card'>
  | Node<GroupData, 'folder'>
  | Node<ModuleData, 'module'>;

const NODE_WIDTH = 240;
const NODE_HEIGHT = 80;
const GROUP_PADDING = 24;
const GROUP_HEADER = 32;

type Point = { readonly x: number; readonly y: number };
type Size = { readonly width: number; readonly height: number };

const runDagre = (
  nodeSizes: ReadonlyMap<string, Size>,
  edges: readonly { readonly from: string; readonly to: string }[],
  spacing: { readonly nodesep: number; readonly ranksep: number },
): ReadonlyMap<string, Point> => {
  // 明示的にジェネリクスを指定しないと Graph<any, any, any> になり、
  // dagre.layout / g.node() の戻り値が any 扱いになってしまう
  const g = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>();
  g.setGraph({ rankdir: 'TB', nodesep: spacing.nodesep, ranksep: spacing.ranksep });
  g.setDefaultEdgeLabel(() => ({}));
  for (const [id, size] of nodeSizes) {
    g.setNode(id, { width: size.width, height: size.height });
  }
  for (const edge of edges) {
    g.setEdge(edge.from, edge.to);
  }
  dagre.layout(g);
  return new Map(
    Array.from(nodeSizes.entries()).map(([id, size]) => {
      const pos = g.node(id);
      // dagre.layout 実行後は必ず x/y が入るが、NodeLabel 上は optional 宣言のため fallback する
      return [id, { x: (pos.x ?? 0) - size.width / 2, y: (pos.y ?? 0) - size.height / 2 }];
    }),
  );
};

// グループ内メンバーのみを対象にした dagre レイアウト（他グループへのエッジは無視する）
const layoutWithinGroup = (
  nodeIds: readonly string[],
  edges: readonly GraphEdge[],
): ReadonlyMap<string, Point> => {
  const nodeIdSet = new Set(nodeIds);
  const innerEdges = edges.filter((edge) => nodeIdSet.has(edge.from) && nodeIdSet.has(edge.to));
  const sizes = new Map(nodeIds.map((id) => [id, { width: NODE_WIDTH, height: NODE_HEIGHT }]));
  return runDagre(sizes, innerEdges, { nodesep: 40, ranksep: 80 });
};

const groupMembership = (
  nodes: readonly GraphNode[],
): { nodeIdsByDir: Map<string, string[]>; dirById: Map<string, string> } => {
  const nodeIdsByDir = new Map<string, string[]>();
  const dirById = new Map<string, string>();
  for (const node of nodes) {
    const dir = dirOf(node.filePath);
    dirById.set(node.id, dir);
    const members = nodeIdsByDir.get(dir);
    if (members) members.push(node.id);
    else nodeIdsByDir.set(dir, [node.id]);
  }
  return { nodeIdsByDir, dirById };
};

// グループ内メンバーの相対座標（saved 優先）と、それを包含するグループサイズを求める
const layoutGroupMembers = (
  nodeIdsByDir: ReadonlyMap<string, string[]>,
  edges: readonly GraphEdge[],
  saved: SavedPositions,
): { relativePositions: Map<string, Point>; groupSizes: Map<string, Size> } => {
  const relativePositions = new Map<string, Point>();
  const groupSizes = new Map<string, Size>();
  for (const [dir, nodeIds] of nodeIdsByDir) {
    const rawLayout = layoutWithinGroup(nodeIds, edges);
    const xs = nodeIds.map((id) => rawLayout.get(id)?.x ?? 0);
    const ys = nodeIds.map((id) => rawLayout.get(id)?.y ?? 0);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    let maxRight = 0;
    let maxBottom = 0;
    for (const id of nodeIds) {
      const raw = rawLayout.get(id) ?? { x: 0, y: 0 };
      const computed = { x: raw.x - minX + GROUP_PADDING, y: raw.y - minY + GROUP_HEADER };
      // saved はドラッグ後の絶対位置ではなく親相対位置として保存される（storage key v2）
      const position = saved[id] ?? computed;
      relativePositions.set(id, position);
      maxRight = Math.max(maxRight, position.x + NODE_WIDTH);
      maxBottom = Math.max(maxBottom, position.y + NODE_HEIGHT);
    }
    // saved position がレイアウト結果の外側にあっても囲えるよう、最終相対座標から再計算する
    groupSizes.set(dir, { width: maxRight + GROUP_PADDING, height: maxBottom + GROUP_PADDING });
  }
  return { relativePositions, groupSizes };
};

// グループ間のエッジをグループペアで dedup する（同一ペアの多重エッジは group-level dagre に不要）
const groupEdgesOf = (
  edges: readonly GraphEdge[],
  dirById: ReadonlyMap<string, string>,
): { from: string; to: string }[] => {
  const seenPairs = new Set<string>();
  const groupEdges: { from: string; to: string }[] = [];
  for (const edge of edges) {
    const fromDir = dirById.get(edge.from);
    const toDir = dirById.get(edge.to);
    if (fromDir === undefined || toDir === undefined || fromDir === toDir) continue;
    const pairKey = `${fromDir}->${toDir}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    groupEdges.push({ from: groupIdOf(fromDir), to: groupIdOf(toDir) });
  }
  return groupEdges;
};

const cardDataOf = (node: GraphNode): CardData => ({
  className: node.className,
  filePath: node.filePath,
  kind: node.kind,
  unresolved: node.unresolved === true,
});

// 同一ノードペアに kind 違いの 2 本が並存しうるため、id に kind を含めて一意化する
const edgesOf = (graph: DependencyGraph): Edge[] =>
  graph.edges.map((edge) => ({
    id: `${edge.from}->${edge.to}#${edge.kind}`,
    source: edge.from,
    target: edge.to,
    animated: false,
    className: `edge-${edge.kind}`,
  }));

// count>1 は折りたたみで束ねられた元エッジ本数。ラベルは集約が起きたときだけ出す
const aggregatedEdgesToFlow = (edges: readonly AggregatedEdge[]): Edge[] =>
  edges.map((edge) => ({
    id: `${edge.from}->${edge.to}#${edge.kind}`,
    source: edge.from,
    target: edge.to,
    animated: false,
    className: `edge-${edge.kind}`,
    label: edge.count > 1 ? `×${edge.count}` : undefined,
  }));

// 折りたたみグループはメンバーを内部レイアウトしないため、固定サイズの単一ノードとして扱う
const collapsedGroupSizesOf = (
  expandedGroupSizes: ReadonlyMap<string, Size>,
  collapsedDirIds: ReadonlySet<string>,
): Map<string, Size> => {
  const sizes = new Map(expandedGroupSizes);
  for (const dir of collapsedDirIds) sizes.set(dir, { width: NODE_WIDTH, height: NODE_HEIGHT });
  return sizes;
};

const positionOf = (
  id: string,
  saved: SavedPositions,
  groupLayout: ReadonlyMap<string, Point>,
): Point => saved[id] ?? groupLayout.get(id) ?? { x: 0, y: 0 };

const groupNodesOf = (
  expandedDirIds: ReadonlyMap<string, string[]>,
  groupSizes: ReadonlyMap<string, Size>,
  saved: SavedPositions,
  groupLayout: ReadonlyMap<string, Point>,
): FlowNode[] =>
  Array.from(expandedDirIds.keys()).map((dir) => {
    const id = groupIdOf(dir);
    const size = groupSizes.get(dir) ?? { width: NODE_WIDTH, height: NODE_HEIGHT };
    return {
      id,
      type: 'folder',
      position: positionOf(id, saved, groupLayout),
      data: { label: displayDirLabel(dir), dir },
      style: { width: size.width, height: size.height },
    };
  });

// id はグループと共通の folder:<dir> を再利用するため、展開時の座標がそのまま引き継がれる
const moduleNodesOf = (
  collapsedDirIds: ReadonlySet<string>,
  nodeIdsByDir: ReadonlyMap<string, string[]>,
  groupSizes: ReadonlyMap<string, Size>,
  saved: SavedPositions,
  groupLayout: ReadonlyMap<string, Point>,
): FlowNode[] =>
  Array.from(collapsedDirIds).map((dir) => {
    const id = groupIdOf(dir);
    const size = groupSizes.get(dir) ?? { width: NODE_WIDTH, height: NODE_HEIGHT };
    return {
      id,
      type: 'module',
      position: positionOf(id, saved, groupLayout),
      data: { label: displayDirLabel(dir), dir, memberCount: nodeIdsByDir.get(dir)?.length ?? 0 },
      style: { width: size.width, height: size.height },
    };
  });

// 折りたたみ dir 所属ノードは module ノードに丸め込まれるため描画しない
const cardNodesOf = (
  nodes: readonly GraphNode[],
  collapsedDirIds: ReadonlySet<string>,
  dirById: ReadonlyMap<string, string>,
  relativePositions: ReadonlyMap<string, Point>,
): FlowNode[] =>
  nodes
    .filter((node) => !collapsedDirIds.has(dirById.get(node.id) ?? dirOf(node.filePath)))
    .map((node) => ({
      id: node.id,
      type: 'card',
      position: relativePositions.get(node.id) ?? { x: 0, y: 0 },
      parentId: groupIdOf(dirById.get(node.id) ?? dirOf(node.filePath)),
      extent: 'parent',
      data: cardDataOf(node),
    }));

const graphToFlowGrouped = (
  graph: DependencyGraph,
  saved: SavedPositions,
  collapsedDirs: ReadonlySet<string>,
): { nodes: FlowNode[]; edges: Edge[] } => {
  const { nodeIdsByDir, dirById } = groupMembership(graph.nodes);
  // 存在しない dir 名は nodeIdsByDir に無いため、ここで自然に無視される
  const collapsedDirIds = new Set(
    Array.from(nodeIdsByDir.keys()).filter((dir) => collapsedDirs.has(dir)),
  );
  const expandedDirIds = new Map(
    Array.from(nodeIdsByDir.entries()).filter(([dir]) => !collapsedDirIds.has(dir)),
  );

  const { relativePositions, groupSizes: expandedGroupSizes } = layoutGroupMembers(
    expandedDirIds,
    graph.edges,
    saved,
  );
  const groupSizes = collapsedGroupSizesOf(expandedGroupSizes, collapsedDirIds);

  const groupEdges = groupEdgesOf(graph.edges, dirById);
  const groupSizesById = new Map(
    Array.from(groupSizes.entries()).map(([dir, size]) => [groupIdOf(dir), size]),
  );
  const groupLayout = runDagre(groupSizesById, groupEdges, { nodesep: 60, ranksep: 120 });

  // React Flow は parent node が配列内で child より前に来る必要がある
  const groupNodes = groupNodesOf(expandedDirIds, groupSizes, saved, groupLayout);
  const moduleNodes = moduleNodesOf(collapsedDirIds, nodeIdsByDir, groupSizes, saved, groupLayout);
  const cardNodes = cardNodesOf(graph.nodes, collapsedDirIds, dirById, relativePositions);

  const collapsed = collapseView(graph, collapsedDirs);
  return {
    nodes: [...groupNodes, ...moduleNodes, ...cardNodes],
    edges: aggregatedEdgesToFlow(collapsed.edges),
  };
};

// グルーピング導入前と同じフラット表示: グループ枠は作らず、全ノードを 1 回の dagre で配置する
const graphToFlowFlat = (
  graph: DependencyGraph,
  saved: SavedPositions,
): { nodes: FlowNode[]; edges: Edge[] } => {
  const sizes = new Map(
    graph.nodes.map((node) => [node.id, { width: NODE_WIDTH, height: NODE_HEIGHT }]),
  );
  const layout = runDagre(sizes, graph.edges, { nodesep: 40, ranksep: 80 });

  const nodes: FlowNode[] = graph.nodes.map((node) => ({
    id: node.id,
    type: 'card',
    position: saved[node.id] ?? layout.get(node.id) ?? { x: 0, y: 0 },
    data: cardDataOf(node),
  }));

  return { nodes, edges: edgesOf(graph) };
};

export type GraphToFlowOptions = {
  readonly grouped: boolean;
  // flat モードでは折りたたみ表示自体が存在しないため無視される
  readonly collapsedDirs?: ReadonlySet<string>;
};

export const graphToFlow = (
  graph: DependencyGraph,
  saved: SavedPositions,
  options: GraphToFlowOptions,
): { nodes: FlowNode[]; edges: Edge[] } =>
  options.grouped
    ? graphToFlowGrouped(graph, saved, options.collapsedDirs ?? new Set())
    : graphToFlowFlat(graph, saved);
