import type { EdgeLabel, GraphLabel, NodeLabel } from '@dagrejs/dagre';
import dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';

import type { DependencyGraph, GraphNode } from '../../src/studio/graph/graph.types';

export type SavedPositions = Readonly<Record<string, { readonly x: number; readonly y: number }>>;

export type CardData = {
  readonly className: string;
  readonly filePath: string;
  readonly kind: GraphNode['kind'];
  readonly unresolved: boolean;
};

export type FlowNode = Node<CardData>;

const NODE_WIDTH = 240;
const NODE_HEIGHT = 80;

const layoutPositions = (graph: DependencyGraph): ReadonlyMap<string, { x: number; y: number }> => {
  // 明示的にジェネリクスを指定しないと Graph<any, any, any> になり、
  // dagre.layout / g.node() の戻り値が any 扱いになってしまう
  const g = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of graph.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of graph.edges) {
    g.setEdge(edge.from, edge.to);
  }
  dagre.layout(g);
  return new Map(
    graph.nodes.map((node) => {
      const pos = g.node(node.id);
      // dagre.layout 実行後は必ず x/y が入るが、NodeLabel 上は optional 宣言のため fallback する
      return [node.id, { x: (pos.x ?? 0) - NODE_WIDTH / 2, y: (pos.y ?? 0) - NODE_HEIGHT / 2 }];
    }),
  );
};

export const graphToFlow = (
  graph: DependencyGraph,
  saved: SavedPositions,
): { nodes: FlowNode[]; edges: Edge[] } => {
  const layout = layoutPositions(graph);
  const nodes: FlowNode[] = graph.nodes.map((node) => ({
    id: node.id,
    type: 'card',
    position: saved[node.id] ?? layout.get(node.id) ?? { x: 0, y: 0 },
    data: {
      className: node.className,
      filePath: node.filePath,
      kind: node.kind,
      unresolved: node.unresolved === true,
    },
  }));
  const edges: Edge[] = graph.edges.map((edge) => ({
    id: `${edge.from}->${edge.to}`,
    source: edge.from,
    target: edge.to,
    animated: false,
  }));
  return { nodes, edges };
};
