import type { Graph } from './graph.lib';
import { required } from './graph.lib';
import { attachments } from './relations.lib';
import type { SourceDeclaration, SourceGroup } from './snapshot.types';
import type { Rect, ViewOptions, ViewState } from './state.types';

export interface Layout {
  readonly boxes: ReadonlyMap<string, Rect>;
  readonly width: number;
  readonly height: number;
}
export interface MemberBox {
  readonly member: SourceDeclaration;
  readonly top: number;
  readonly height: number;
}

const COLUMN_TOP = 70;
const GROUP_GAP = 56;
const HEADER_HEIGHT = 62;
const ROW_HEIGHT = 46;
const ROW_MARGIN = 3;
// One .member-hint line (10px × line-height 1.7); the first hint fits in the base row.
const HINT_LINE_HEIGHT = 17;
const TAG_AREA = 22;
const TAG_ROW = 26;

export function isOnMap(group: SourceGroup, options: ViewOptions): boolean {
  return !options.hiddenColumns.includes(group.presentation.columnId);
}

function rowHeight(declaration: SourceDeclaration): number {
  return ROW_HEIGHT + Math.max(0, declaration.hints.length - 1) * HINT_LINE_HEIGHT;
}

export function sourceOrderedMembers(group: SourceGroup): readonly SourceDeclaration[] {
  return [...group.members].sort(
    (a, b) => a.source.location.startLine - b.source.location.startLine || byCodeUnit(a.id, b.id),
  );
}

export function memberBoxes(group: SourceGroup): readonly MemberBox[] {
  let top = HEADER_HEIGHT;
  return sourceOrderedMembers(group).map((member) => {
    const box = { member, top, height: rowHeight(member) - ROW_MARGIN };
    top += rowHeight(member);
    return box;
  });
}

// Code-unit comparison keeps the order identical on every machine, unlike locale collation.
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sourceOrder(groups: readonly SourceGroup[]): readonly SourceGroup[] {
  return [...groups].sort(
    (a, b) =>
      byCodeUnit(a.filePath, b.filePath) ||
      a.source.location.startLine - b.source.location.startLine ||
      byCodeUnit(a.id, b.id),
  );
}

export function layout(graph: Graph, view: ViewState): Layout {
  const boxes = new Map<string, Rect>();
  const visibleNotes = attachments(graph, view.options.hiddenColumns, view.options.showTypes);
  let x = 0,
    bottom = 0;
  for (const column of graph.snapshot.graph.presentation.columns) {
    const shown = !view.options.hiddenColumns.includes(column.id);
    let y = COLUMN_TOP;
    const groups = sourceOrder(
      [...graph.groups.values()].filter((g) => g.presentation.columnId === column.id),
    );
    for (const group of groups) {
      const count = visibleNotes.filter((n) => n.groupId === group.id).length;
      const tags = count ? TAG_AREA + Math.ceil(count / 2) * TAG_ROW : 0;
      const rows = view.expanded.includes(group.id)
        ? group.members.reduce((sum, m) => sum + rowHeight(m), 0)
        : 0;
      const height = HEADER_HEIGHT + rows + tags;
      // Hidden groups keep a box for lookups; a hidden column takes no room on the map.
      boxes.set(group.id, { x: x + 14, y, width: column.width - 28, height });
      if (shown) bottom = Math.max(bottom, y + height);
      y += height + GROUP_GAP;
    }
    if (shown) x += column.width;
  }
  return {
    boxes,
    width: x + 20,
    height: bottom + 82,
  };
}

export function position(graph: Graph, view: ViewState, geometry: Layout, id: string): Rect {
  const group = required(graph.owners, id),
    box = required(geometry.boxes, group.id);
  const member = memberBoxes(group).find((b) => b.member.id === id);
  const header = member === undefined || !view.expanded.includes(group.id);
  return { ...box, y: box.y + (header ? 20 : member.top + 10), height: 26 };
}

export function displayUnit(graph: Graph, view: ViewState, id: string): string {
  const group = required(graph.owners, id);
  return view.expanded.includes(group.id) ? id : group.id;
}
