import type {
  DependencyGraph,
  GraphNode,
  MethodSignature,
} from '../../src/studio/graph/graph.types';

export const formatMethodSignature = (sig: MethodSignature): string =>
  `${sig.name}(${sig.params.map((p) => `${p.name}: ${p.type}`).join(', ')}): ${sig.returnType}`;

export const findGraphNode = (graph: DependencyGraph, id: string): GraphNode | undefined =>
  graph.nodes.find((node) => node.id === id);
