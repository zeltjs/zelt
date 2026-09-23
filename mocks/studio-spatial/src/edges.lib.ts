import type { EdgeModel } from './display.types';
import type { Graph, Relation } from './graph.lib';
import { subject } from './graph.lib';
import { relationLabels } from './labels';
import type { Layout } from './layout.lib';
import { displayUnit, position } from './layout.lib';
import type { Rect, ViewState } from './state.types';

interface Bundle {
  readonly from: string;
  readonly to: string;
  readonly kind: Relation['kind'];
  readonly originals: Relation[];
}
export function relationTitle(graph: Graph, edges: readonly Relation[]): string {
  return edges
    .map(
      (e) =>
        `${subject(graph, e.from).name} —${relationLabels[e.kind]}→ ${subject(graph, e.to).name}`,
    )
    .join('\n');
}

function bundles(graph: Graph, view: ViewState, edges: readonly Relation[]): readonly Bundle[] {
  const result = new Map<string, Bundle>();
  for (const edge of edges) {
    const from = displayUnit(graph, view, edge.from),
      to = displayUnit(graph, view, edge.to);
    if (from === to && !view.expanded.includes(from)) continue;
    const key = JSON.stringify([from, to, edge.kind]);
    const bundle = result.get(key);
    if (bundle) bundle.originals.push(edge);
    else result.set(key, { from, to, kind: edge.kind, originals: [edge] });
  }
  return [...result.values()];
}

function curve(from: Rect, to: Rect, offset: number, index: number) {
  const y1 = from.y + 10 + offset,
    y2 = to.y + 10 + offset;
  if (from.x === to.x) {
    const x = from.x + from.width,
      lane = x + 8 + (index % 3) * 4;
    return { path: `M ${x} ${y1} H ${lane} V ${y2} H ${x}`, x: x + 18, y: (y1 + y2) / 2 - 5 };
  }
  const x1 = from.x > to.x ? from.x : from.x + from.width;
  const x2 = from.x > to.x ? to.x + to.width : to.x;
  const bend = Math.min(160, Math.abs(x2 - x1) / 2) * (x2 > x1 ? 1 : -1);
  return {
    path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
    x: (x1 + x2) / 2,
    y: (y1 + y2) / 2 - 5,
  };
}

export function projectEdges(
  graph: Graph,
  view: ViewState,
  geometry: Layout,
  edges: readonly Relation[],
): readonly EdgeModel[] {
  const projected = bundles(graph, view, edges);
  return projected.map((edge, index) => {
    const pair = JSON.stringify([edge.from, edge.to].sort());
    const parallels = projected.filter((e) => JSON.stringify([e.from, e.to].sort()) === pair);
    const offset =
      (parallels.indexOf(edge) - (parallels.length - 1) / 2) * Math.min(10, 28 / parallels.length);
    const path = curve(
      position(graph, view, geometry, edge.from),
      position(graph, view, geometry, edge.to),
      offset,
      index,
    );
    return {
      key: JSON.stringify([edge.from, edge.to, edge.kind]),
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      ids: edge.originals.map((e) => e.id),
      title: relationTitle(graph, edge.originals),
      path: path.path,
      count:
        view.options.showCounts && edge.originals.length > 1
          ? { text: `×${edge.originals.length}`, x: path.x, y: path.y }
          : null,
    };
  });
}
