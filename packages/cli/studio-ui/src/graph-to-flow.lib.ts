import type { EdgeLabel, GraphLabel, NodeLabel } from '@dagrejs/dagre';
import dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';

import type { DependencyGraph, GraphEdge, GraphNode } from '../../src/studio/graph/graph.types';

export type SavedPositions = Readonly<Record<string, { readonly x: number; readonly y: number }>>;

export type CardData = {
  readonly className: string;
  readonly filePath: string;
  readonly kind: GraphNode['kind'];
  readonly unresolved: boolean;
};

export type GroupData = { readonly label: string };

export type FlowNode = Node<CardData, 'card'> | Node<GroupData, 'folder'>;

const NODE_WIDTH = 240;
const NODE_HEIGHT = 80;
const GROUP_PADDING = 24;
const GROUP_HEADER = 32;

// filePath はファイル単位、グループはディレクトリ単位。"(unknown)" は
// スラッシュを含まないため自身がグループ key になり、まとまって表示される
const dirOf = (filePath: string): string => {
  const parts = filePath.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : filePath;
};

// card node の id（クラス由来の任意文字列）と衝突しないよう prefix する
const groupIdOf = (dir: string): string => `folder:${dir}`;

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

const graphToFlowGrouped = (
  graph: DependencyGraph,
  saved: SavedPositions,
): { nodes: FlowNode[]; edges: Edge[] } => {
  const { nodeIdsByDir, dirById } = groupMembership(graph.nodes);
  const { relativePositions, groupSizes } = layoutGroupMembers(nodeIdsByDir, graph.edges, saved);

  const groupEdges = groupEdgesOf(graph.edges, dirById);
  const groupSizesById = new Map(
    Array.from(groupSizes.entries()).map(([dir, size]) => [groupIdOf(dir), size]),
  );
  const groupLayout = runDagre(groupSizesById, groupEdges, { nodesep: 60, ranksep: 120 });

  // React Flow は parent node が配列内で child より前に来る必要がある
  const groupNodes: FlowNode[] = Array.from(nodeIdsByDir.keys()).map((dir) => {
    const id = groupIdOf(dir);
    const size = groupSizes.get(dir) ?? { width: NODE_WIDTH, height: NODE_HEIGHT };
    return {
      id,
      type: 'folder',
      position: saved[id] ?? groupLayout.get(id) ?? { x: 0, y: 0 },
      data: { label: dir },
      style: { width: size.width, height: size.height },
    };
  });
  const cardNodes: FlowNode[] = graph.nodes.map((node) => ({
    id: node.id,
    type: 'card',
    position: relativePositions.get(node.id) ?? { x: 0, y: 0 },
    parentId: groupIdOf(dirById.get(node.id) ?? dirOf(node.filePath)),
    extent: 'parent',
    data: cardDataOf(node),
  }));

  return { nodes: [...groupNodes, ...cardNodes], edges: edgesOf(graph) };
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

export type GraphToFlowOptions = { readonly grouped: boolean };

export const graphToFlow = (
  graph: DependencyGraph,
  saved: SavedPositions,
  options: GraphToFlowOptions,
): { nodes: FlowNode[]; edges: Edge[] } =>
  options.grouped ? graphToFlowGrouped(graph, saved) : graphToFlowFlat(graph, saved);
