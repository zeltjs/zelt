import type { DeclarationModel, GroupModel, MapModel, TagModel } from './display.types';
import { projectEdges, relationTitle } from './edges.lib';
import type { Graph, Relation } from './graph.lib';
import { required, seeds } from './graph.lib';
import { declarationLabels } from './labels';
import type { Layout } from './layout.lib';
import { displayUnit, layout } from './layout.lib';
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
  readonly changed: ReadonlySet<string>;
  readonly relations: readonly Relation[];
  readonly notes: readonly Attachment[];
}

function tagLabel(graph: Graph, note: Attachment): string {
  if (note.kind === 'config') return '設定との関係あり';
  const owner = required(graph.owners, note.target);
  if (note.kind === 'middleware') return `適用: ${owner.name.replace(/Middleware$/, '')}`;
  const event = eventExpression(note);
  const target = note.kind === 'event' && !note.incoming ? event : owner.name;
  return `${note.kind}${note.incoming ? '元' : '先'} ↗ ${target}`;
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
    title: relationTitle(note.relations),
    dimmed,
  };
}

function declarationModels(ctx: Context, group: SourceGroup): readonly DeclarationModel[] {
  if (!ctx.view.expanded.includes(group.id)) return [];
  return group.members.map((m, index) => ({
    id: m.id,
    label: m.name + (m.kind === 'method' || m.kind === 'function' ? '()' : ''),
    kind: declarationLabels[m.kind],
    callable: ['method', 'constructor', 'function', 'callback'].includes(m.kind),
    hint: m.presentation.hint ?? '',
    top: 62 + index * 46,
    dimmed: ctx.active.size > 0 && !ctx.active.has(m.id),
    selected: ctx.view.node === m.id,
    changed: ctx.changed.has(m.id),
  }));
}

function groupModel(ctx: Context, group: SourceGroup): GroupModel {
  const represented = seeds(ctx.graph, group.id);
  const dimmed = ctx.active.size > 0 && !represented.some((id) => ctx.active.has(id));
  return {
    id: group.id,
    kind: group.kind.toUpperCase() + (group.expansion === 'boundary' ? ' · 内部未展開' : ''),
    rect: required(ctx.geometry.boxes, group.id),
    expanded: ctx.view.expanded.includes(group.id),
    dimmed,
    selected:
      ctx.view.node !== null && displayUnit(ctx.graph, ctx.view, ctx.view.node) === group.id,
    changed: represented.some((id) => ctx.changed.has(id)),
    members: declarationModels(ctx, group),
    tags: ctx.notes.filter((n) => n.groupId === group.id).map((n) => tagModel(ctx, n, dimmed)),
  };
}

function context(graph: Graph, view: ViewState): Context {
  const relations = scopeRelations(graph, view);
  const active = new Set(relations.flatMap((r) => [r.from, r.to]));
  const origin = focus(view);
  if (origin !== null) for (const id of seeds(graph, origin)) active.add(id);
  const scenario = graph.snapshot.graph.presentation.demoScenarios.find((s) => s.id === view.demo);
  return {
    graph,
    view,
    geometry: layout(graph, view),
    active,
    changed: new Set(scenario?.highlightedIds ?? []),
    relations,
    notes: attachments(graph, view.options.showConfig, view.options.showTypes),
  };
}

export function presentMap(graph: Graph, view: ViewState): MapModel {
  const ctx = context(graph, view);
  const allowed = ctx.relations.filter((e) => view.options.showTypes || e.kind !== 'type');
  const wires = allowed.filter((e) => relationPart(graph, e, view.options.showConfig) === 'wires');
  const edges = projectEdges(graph, view, ctx.geometry, wires);
  let x = 0;
  const columns = graph.snapshot.graph.presentation.columns.map((c) => {
    const column = { label: c.label, x, width: c.width };
    x += c.width;
    return column;
  });
  const visible = [...graph.groups.values()].filter(
    (g) =>
      g.presentation.role !== 'composition' &&
      (view.options.showConfig || g.presentation.role !== 'config'),
  );
  return {
    width: ctx.geometry.width,
    height: ctx.geometry.height,
    columns,
    groups: visible.map((g) => groupModel(ctx, g)),
    edges,
    configHidden: !view.options.showConfig,
    summary: view.node
      ? `詳細の選択: ${view.node}`
      : '全体の配置 · 箱を選ぶと、使う先と使う元の線を表示',
    lineCount: `範囲内: ${edges.length}線 / ${allowed.length}関係`,
  };
}
