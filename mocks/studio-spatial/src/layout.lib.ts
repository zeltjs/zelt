import type { Graph } from './graph.lib';
import { required } from './graph.lib';
import { attachments } from './relations.lib';
import type { Rect, ViewState } from './state.types';

export interface Layout {
  readonly boxes: ReadonlyMap<string, Rect>;
  readonly width: number;
  readonly height: number;
}
export function layout(graph: Graph, view: ViewState): Layout {
  const boxes = new Map<string, Rect>();
  const visibleNotes = attachments(graph, view.options.showConfig, view.options.showTypes);
  let x = 0;
  for (const column of graph.snapshot.graph.presentation.columns) {
    let removed = 0;
    const groups = [...graph.groups.values()]
      .filter((g) => g.presentation.columnId === column.id)
      .sort((a, b) => a.presentation.expandedY - b.presentation.expandedY);
    for (const group of groups) {
      const count = visibleNotes.filter((n) => n.groupId === group.id).length;
      const reserved = count ? 22 + Math.ceil(count / 2) * 26 : 0;
      const fullHeight = 62 + group.members.length * 46;
      const height = (view.expanded.includes(group.id) ? fullHeight : 62) + reserved;
      boxes.set(group.id, {
        x: x + 14,
        y: group.presentation.expandedY - removed,
        width: column.width - 28,
        height,
      });
      removed += fullHeight - height;
    }
    x += column.width;
  }
  return {
    boxes,
    width: x + 20,
    height: Math.max(0, ...[...boxes.values()].map((b) => b.y + b.height)) + 82,
  };
}

export function position(graph: Graph, view: ViewState, geometry: Layout, id: string): Rect {
  const group = required(graph.owners, id),
    box = required(geometry.boxes, group.id);
  const index = group.members.findIndex((m) => m.id === id);
  const header = index < 0 || !view.expanded.includes(group.id);
  return { ...box, y: box.y + (header ? 20 : 72 + index * 46), height: 26 };
}

export function displayUnit(graph: Graph, view: ViewState, id: string): string {
  const group = required(graph.owners, id);
  return view.expanded.includes(group.id) ? id : group.id;
}
