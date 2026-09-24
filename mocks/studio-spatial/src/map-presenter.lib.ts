import type { DeclarationModel, GroupModel, MapModel, TagModel } from './display.types';
import { projectEdges, relationTitle } from './edges.lib';
import type { Graph, Relation } from './graph.lib';
import { required, seeds, subject } from './graph.lib';
import { declarationLabel, relationKind } from './labels';
import type { Layout } from './layout.lib';
import { displayUnit, isOnMap, layout, memberBoxes } from './layout.lib';
import type { Attachment } from './relations.lib';
import { attachments, relationPart } from './relations.lib';
import { focus, scopeRelations } from './scope.lib';
import type { SourceGroup } from './snapshot.types';
import type { ViewState } from './state.types';

interface Context {
  readonly graph: Graph;
  readonly view: ViewState;
  readonly geometry: Layout;
  readonly active: ReadonlySet<string>;
  readonly relations: readonly Relation[];
  readonly notes: readonly Attachment[];
}

function tagLabel(graph: Graph, note: Attachment): string {
  const owner = required(graph.owners, note.target);
  if (note.kind === 'middleware') return `適用: ${owner.name.replace(/Middleware$/, '')}`;
  return note.incoming
    ? `${note.kind}元 ↗ ${owner.name}`
    : `${note.kind}先 ↗ ${eventExpression(note)}`;
}

function eventExpression(note: Attachment): string {
  return note.relations.at(0)?.evidence.at(0)?.expression ?? note.target;
}

function tagModel(ctx: Context, note: Attachment, groupDimmed: boolean): TagModel {
  const active = note.relations.some((e) =>
    note.kind === 'middleware' ? ctx.active.has(e.from) : ctx.relations.includes(e),
  );
  const dimmed =
    groupDimmed || (ctx.view.expanded.includes(note.groupId) && ctx.active.size > 0 && !active);
  return {
    key: note.key,
    kind: note.kind,
    label: tagLabel(ctx.graph, note),
    title: relationTitle(ctx.graph, note.relations),
    dimmed,
  };
}

// 「この処理はどの責務をどの順に通るか」は事実なので、順序を持つタグは JSON の並びでなく
// snapshot の order で並べる(付録J: 列内の並びは UI が計算)。順序を持たないタグはその後ろへ
function appliedOrder(notes: readonly Attachment[]): readonly Attachment[] {
  const rank = (note: Attachment): number => note.order ?? Number.MAX_SAFE_INTEGER;
  return notes
    .map((note, index) => ({ note, index }))
    .sort((a, b) => rank(a.note) - rank(b.note) || a.index - b.index)
    .map(({ note }) => note);
}

function declarationModels(ctx: Context, group: SourceGroup): readonly DeclarationModel[] {
  if (!ctx.view.expanded.includes(group.id)) return [];
  return memberBoxes(group).map(({ member: m, top, height }) => ({
    id: m.id,
    label: m.name + (m.kind === 'method' || m.kind === 'function' ? '()' : ''),
    kind: declarationLabel(m),
    callable: ['method', 'constructor', 'function', 'callback'].includes(m.kind),
    hints: m.hints.map((h) => ({ key: JSON.stringify([h.provider, h.label]), label: h.label })),
    top,
    height,
    dimmed: ctx.active.size > 0 && !ctx.active.has(m.id),
    selected: ctx.view.node === m.id,
  }));
}

function groupModel(ctx: Context, group: SourceGroup): GroupModel {
  const represented = seeds(ctx.graph, group.id);
  const dimmed = ctx.active.size > 0 && !represented.some((id) => ctx.active.has(id));
  return {
    id: group.id,
    name: group.name,
    kind: group.kind.toUpperCase() + (group.expansion === 'boundary' ? ' · 内部未展開' : ''),
    rect: required(ctx.geometry.boxes, group.id),
    expanded: ctx.view.expanded.includes(group.id),
    dimmed,
    selected:
      ctx.view.node !== null && displayUnit(ctx.graph, ctx.view, ctx.view.node) === group.id,
    members: declarationModels(ctx, group),
    tags: appliedOrder(ctx.notes.filter((n) => n.groupId === group.id)).map((n) =>
      tagModel(ctx, n, dimmed),
    ),
  };
}

function context(graph: Graph, view: ViewState): Context {
  const relations = scopeRelations(graph, view);
  const active = new Set(relations.flatMap((r) => [r.from, r.to]));
  const origin = focus(view);
  if (origin !== null) for (const id of seeds(graph, origin)) active.add(id);
  return {
    graph,
    view,
    geometry: layout(graph, view),
    active,
    relations,
    notes: attachments(graph, view.options.hiddenColumns, view.options.showTypes),
  };
}

export function presentMap(graph: Graph, view: ViewState): MapModel {
  const ctx = context(graph, view);
  const hidden = view.options.hiddenColumns;
  const allowed = ctx.relations.filter((e) => view.options.showTypes || relationKind(e) !== 'type');
  const wires = allowed.filter((e) => relationPart(graph, e, hidden) === 'wires');
  const edges = projectEdges(graph, view, ctx.geometry, wires);
  let x = 0;
  const columns = graph.snapshot.graph.presentation.columns
    .filter((c) => !hidden.includes(c.id))
    .map((c) => {
      const column = { label: c.label, x, width: c.width };
      x += c.width;
      return column;
    });
  const visible = [...graph.groups.values()].filter((g) => isOnMap(g, view.options));
  return {
    width: ctx.geometry.width,
    height: ctx.geometry.height,
    columns,
    groups: visible.map((g) => groupModel(ctx, g)),
    edges,
    summary: view.node
      ? `詳細の選択: ${subject(graph, view.node).name}`
      : '全体の配置 · 箱を選ぶと、使う先と使う元の線を表示',
    lineCount: `範囲内: ${edges.length}線 / ${allowed.length}関係`,
  };
}
