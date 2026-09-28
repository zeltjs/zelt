import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { array, boolean, literal, null_, object, parse, string, union } from 'valibot';
import { describe, expect, it } from 'vitest';
import { displayNames, fixture, identity } from './fixture';
import { required } from './graph.lib';
import { layout } from './layout.lib';
import { presentMap } from './map-presenter.lib';
import { scopeRelations } from './scope.lib';
import { declaration, graphOf, group } from './snapshot-builder.lib';
import { initialView } from './state.lib';
import type { ViewState } from './state.types';

const golden = parse(
  array(
    object({
      node: union([string(), null_()]),
      mode: union([literal('near'), literal('flow'), literal('all')]),
      expanded: boolean(),
      showConfig: boolean(),
      showTypes: boolean(),
      hash: string(),
    }),
  ),
  JSON.parse(
    readFileSync(new URL('../test-fixtures/legacy-display.json', import.meta.url), 'utf8'),
  ),
);
const graph = fixture();
const nodeId = (name: string) => identity(graph, name);
const displayOwner = (id: string) => required(graph.owners, id).id;
// The golden states name the Config column's visibility; Composition stays hidden as it starts.
const hiddenColumns = (showConfig: boolean) =>
  showConfig ? ['column:composition'] : ['column:composition', 'column:5'];

// 抽出器のIDは所在と構造の写しなので、goldenは表示名で読む。名前は1対1なので
// 退行の検出力は変わらず、IDの形式が変わってもgoldenを作り直さずに済む。
const names = displayNames(graph);
function named(value: string): string {
  const name = names.get(value);
  if (name !== undefined) return name;
  // タグのkeyのように、IDを要素に持つJSON配列も名前へ置き換える
  if (!value.startsWith('[')) return value;
  const parts: unknown = JSON.parse(value);
  if (!Array.isArray(parts)) return value;
  return JSON.stringify(parts.map((p: unknown) => (typeof p === 'string' ? named(p) : p)));
}

describe('Presenter preserves the pre-React display contract', () => {
  it.each(
    golden,
  )('matches legacy projection: $node/$mode expanded=$expanded config=$showConfig types=$showTypes', (test) => {
    const view: ViewState = {
      ...initialView(graph),
      node: test.node === null ? null : nodeId(test.node),
      scope: { kind: 'following', mode: test.mode },
      expanded: test.expanded ? [...graph.groups.keys()] : [],
      options: {
        hiddenColumns: hiddenColumns(test.showConfig),
        showTypes: test.showTypes,
        showCounts: true,
      },
    };
    const model = presentMap(graph, view);
    // Hash geometry under one fixed tag-reservation policy so the golden covers ordering and
    // stacking; visible-tag geometry is verified independently below.
    const legacyGeometry = layout(graph, {
      ...view,
      options: { ...view.options, showTypes: true },
    });
    // JSONの並びに表示の意味は無い(列内の並びはUIが計算する)ので、名前順にそろえて比べる
    const groups = model.groups
      .map((g) => ({
        id: named(g.id),
        rect: required(legacyGeometry.boxes, g.id),
        expanded: g.expanded,
        selected: g.selected,
        dimmed: g.dimmed,
        members: g.members.map((m) => [named(m.id), m.selected, m.dimmed]),
        tags: g.tags
          .map((t) => [named(t.key), t.dimmed])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const wires = model.edges
      .map((e) => [named(e.from), named(e.to), e.kind, e.ids.map(named).sort()])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const json = JSON.stringify({
      groups,
      wires,
      width: model.width,
      height: legacyGeometry.height,
    });
    expect(createHash('sha256').update(json).digest('hex')).toBe(test.hash);
  });
  it('keeps every collapsed attachment at the same emphasis as its owner', () => {
    for (const node of graph.owners.keys()) {
      const model = presentMap(graph, { ...initialView(graph), node });
      for (const group of model.groups)
        for (const tag of group.tags) expect(tag.dimmed).toBe(group.dimmed);
    }
  });
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])('reserves space only for rendered tags: expanded=%s config=%s', (expanded, showConfig) => {
    for (const showTypes of [false, true]) {
      const view: ViewState = {
        ...initialView(graph),
        node: nodeId('ProductController#create'),
        expanded: expanded ? [...graph.groups.keys()] : [],
        options: { hiddenColumns: hiddenColumns(showConfig), showTypes, showCounts: true },
      };
      const model = presentMap(graph, view);
      for (const group of model.groups) {
        const tagHeight = group.tags.length ? 22 + Math.ceil(group.tags.length / 2) * 26 : 0;
        expect(group.rect.height).toBe(62 + group.members.length * 46 + tagHeight);
      }
      // EcJwtConfig's resolveUser callback types EcUser; hiding Config must leave no trace of it.
      const users = model.groups.find((g) => g.id === nodeId('user.types.ts'));
      expect(users).toMatchObject({ dimmed: true, tags: [] });
    }
  });
  it.each([false, true])('keeps subsequent nodes from overlapping: expanded=%s', (expanded) => {
    for (const showConfig of [false, true]) {
      const view = initialView(graph);
      const model = presentMap(graph, {
        ...view,
        expanded: expanded ? [...graph.groups.keys()] : [],
        options: { ...view.options, hiddenColumns: hiddenColumns(showConfig) },
      });
      for (const column of graph.snapshot.graph.presentation.columns) {
        const groups = model.groups.filter(
          (g) => required(graph.groups, g.id).presentation.columnId === column.id,
        );
        groups.sort((a, b) => a.rect.y - b.rect.y);
        let previousBottom = 0;
        for (const group of groups) {
          expect(group.rect.y).toBeGreaterThanOrEqual(previousBottom);
          previousBottom = group.rect.y + group.rect.height;
        }
      }
    }
  });
  it('does not mutate source data or widen traversal when folding or hiding config/types', () => {
    const before = JSON.stringify(graph.snapshot);
    const view: ViewState = {
      ...initialView(graph),
      node: nodeId('OrderService#findById'),
      scope: { kind: 'following', mode: 'flow' },
    };
    const expected = scopeRelations(graph, view);
    const altered = {
      ...view,
      expanded: [...graph.groups.keys()],
      options: { showTypes: false, showCounts: false, hiddenColumns: hiddenColumns(false) },
    };
    presentMap(graph, altered);
    expect(scopeRelations(graph, altered)).toEqual(expected);
    expect(JSON.stringify(graph.snapshot)).toBe(before);
  });
  it('does not switch direction at shared dependencies', () => {
    const view: ViewState = {
      ...initialView(graph),
      node: nodeId('ProductController#create'),
      scope: { kind: 'following', mode: 'flow' },
    };
    const edges = scopeRelations(graph, view);
    expect(edges.some((e) => e.from === nodeId('ProductService#create'))).toBe(true);
    expect(edges.some((e) => e.from === nodeId('OrderController#create'))).toBe(false);
    expect(edges.some((e) => e.origin === 'plugin' && e.kind === 'middleware')).toBe(false);
  });
});

describe('Presenter keeps the look of meanings and hides columns with their relations', () => {
  it('shows the granted meaning on wires and declarations, as before the split', () => {
    const view: ViewState = {
      ...initialView(graph),
      node: nodeId('AuthService#register'),
      expanded: [nodeId('AuthService'), nodeId('schema.ts')],
    };
    const model = presentMap(graph, view);
    expect(model.edges.map((e) => e.kind)).toContain('table');
    const users = model.groups
      .find((g) => g.id === nodeId('schema.ts'))
      ?.members.find((m) => m.id === nodeId('schema.ts#users'));
    expect(users?.kind).toBe('TABLE');
  });
  it('starts with the composition column hidden, leaving no box, wire or tag for it', () => {
    const model = presentMap(graph, initialView(graph));
    expect(model.groups.map((g) => g.id)).not.toContain(nodeId('app.ts'));
    expect(model.columns.map((c) => c.label)).not.toContain('Composition');
    const onMap = new Set(model.groups.map((g) => g.id));
    expect(
      model.edges.flatMap((e) => [e.from, e.to]).every((id) => onMap.has(displayOwner(id))),
    ).toBe(true);
    const registered = model.groups.find((g) => g.id === nodeId('AuthController'))?.tags;
    expect(registered?.map((t) => t.label)).not.toContain('Compositionとの関係あり');
  });
  it('hides the library column like any other column', () => {
    const view = initialView(graph);
    const model = presentMap(graph, {
      ...view,
      options: { ...view.options, hiddenColumns: ['column:composition', 'column:6'] },
    });
    expect(model.groups.map((g) => g.id)).not.toContain(nodeId('JwtService'));
    expect(model.groups.find((g) => g.id === nodeId('AuthService'))?.tags).toEqual([]);
    const applied = model.groups
      .find((g) => g.id === nodeId('AuthController'))
      ?.tags.map((t) => t.label);
    expect(applied).toContain('適用: Logging');
    expect(applied).not.toContain('適用: Jwt');
  });
  it('orders applied tags by the chain the request runs through, not by the JSON order', () => {
    const model = presentMap(graph, initialView(graph));
    const applied = model.groups
      .find((g) => g.id === nodeId('CartController'))
      ?.tags.map((t) => t.label);
    expect(applied).toEqual(['適用: Logging', '適用: Jwt']);
  });
});

describe('Presenter shows hints and names instead of identities', () => {
  const hinted = graphOf([
    group(
      '["class","a.ts","Routes"]',
      [
        declaration('["route"]', {
          name: 'create',
          hints: [
            { provider: 'zelt', label: 'POST /a' },
            { provider: 'other', label: 'PUT /a' },
          ],
          calls: ['["helper"]'],
        }),
        declaration('["helper"]', { name: 'helper', startLine: 5 }),
      ],
      { name: 'Routes' },
    ),
  ]);
  it('lists every hint label as its own line and pushes later rows down', () => {
    const model = presentMap(hinted, {
      ...initialView(hinted),
      expanded: ['["class","a.ts","Routes"]'],
    });
    const [routes] = model.groups;
    expect(routes).toMatchObject({ name: 'Routes' });
    expect(
      routes?.members.map((m) => [m.label, m.hints.map((h) => h.label), m.top, m.height]),
    ).toEqual([
      ['create()', ['POST /a', 'PUT /a'], 62, 60],
      ['helper()', [], 125, 43],
    ]);
  });
  it('titles wires with names', () => {
    const model = presentMap(hinted, {
      ...initialView(hinted),
      node: '["route"]',
      expanded: ['["class","a.ts","Routes"]'],
    });
    expect(model.edges.map((e) => e.title)).toEqual(['create —呼ぶ→ helper']);
  });
});
