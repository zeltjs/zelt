import type { Graph, Relation } from './graph.lib';
import { seeds } from './graph.lib';
import { grantedKind } from './labels';
import type { ViewState } from './state.types';

function trace(
  seeds: readonly string[],
  edges: readonly Relation[],
  from: 'from' | 'to',
  to: 'from' | 'to',
): Set<Relation> {
  const nodes = new Set(seeds);
  const traversed = new Set<Relation>();
  for (const id of nodes) {
    for (const edge of edges) {
      if (edge[from] !== id) continue;
      traversed.add(edge);
      nodes.add(edge[to]);
    }
  }
  return traversed;
}

export function focus(view: ViewState): string | null {
  return view.scope.kind === 'locked' ? view.scope.anchor : view.node;
}

export function scopeRelations(graph: Graph, view: ViewState): readonly Relation[] {
  if (view.scope.mode === 'all') return graph.relations;
  const id = focus(view);
  if (id === null) return [];
  const start = seeds(graph, id);
  const edges = graph.relations.filter((e) => grantedKind(e) !== 'middleware');
  if (view.scope.mode === 'near')
    return edges.filter((e) => start.includes(e.from) || start.includes(e.to));
  const use = trace(start, edges, 'from', 'to');
  const usedBy = trace(start, edges, 'to', 'from');
  return edges.filter((e) => use.has(e) || usedBy.has(e));
}
