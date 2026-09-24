import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { array, boolean, literal, null_, object, parse, string, union } from 'valibot';
import { describe, expect, it } from 'vitest';
import { fixture } from './fixture.lib';
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
  JSON.parse(readFileSync(new URL('./test-fixtures/legacy-display.json', import.meta.url), 'utf8')),
);
const graph = fixture();
const displayOwner = (id: string) => required(graph.owners, id).id;
// The golden states name the Config column's visibility; Composition stays hidden as it starts.
const hiddenColumns = (showConfig: boolean) =>
  showConfig ? ['column:composition'] : ['column:composition', 'column:5'];

describe('Presenter preserves the pre-React display contract', () => {
  it.each(
    golden,
  )('matches legacy projection: $node/$mode expanded=$expanded config=$showConfig types=$showTypes', (test) => {
    const view: ViewState = {
      ...initialView(graph),
      node: test.node,
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
    const groups = model.groups.map((g) => ({
      id: g.id,
      rect: required(legacyGeometry.boxes, g.id),
      expanded: g.expanded,
      selected: g.selected,
      dimmed: g.dimmed,
      members: g.members.map((m) => [m.id, m.selected, m.dimmed]),
      tags: g.tags
        .map((t) => [t.key, t.dimmed])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    }));
    const wires = model.edges
      .map((e) => [e.from, e.to, e.kind, [...e.ids].sort()])
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
        node: 'ProductController.create',
        expanded: expanded ? [...graph.groups.keys()] : [],
        options: { hiddenColumns: hiddenColumns(showConfig), showTypes, showCounts: true },
      };
      const model = presentMap(graph, view);
      for (const group of model.groups) {
        const tagHeight = group.tags.length ? 22 + Math.ceil(group.tags.length / 2) * 26 : 0;
        expect(group.rect.height).toBe(62 + group.members.length * 46 + tagHeight);
      }
      // EcJwtConfig's resolveUser callback types EcUser; hiding Config must leave no trace of it.
      const users = model.groups.find((g) => g.id === 'user.types.ts');
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
      node: 'OrderService.findById',
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
      node: 'ProductController.create',
      scope: { kind: 'following', mode: 'flow' },
    };
    const edges = scopeRelations(graph, view);
    expect(edges.some((e) => e.from === 'ProductService.create')).toBe(true);
    expect(edges.some((e) => e.from === 'OrderController.create')).toBe(false);
    expect(edges.some((e) => e.origin === 'plugin' && e.kind === 'middleware')).toBe(false);
  });
});

describe('Presenter keeps the look of meanings and hides columns with their relations', () => {
  it('shows the granted meaning on wires and declarations, as before the split', () => {
    const view: ViewState = {
      ...initialView(graph),
      node: 'AuthService.register',
      expanded: ['AuthService', 'schema.ts'],
    };
    const model = presentMap(graph, view);
    expect(model.edges.map((e) => e.kind)).toContain('table');
    const users = model.groups
      .find((g) => g.id === 'schema.ts')
      ?.members.find((m) => m.id === 'users');
    expect(users?.kind).toBe('TABLE');
  });
  it('starts with the composition column hidden, leaving no box, wire or tag for it', () => {
    const model = presentMap(graph, initialView(graph));
    expect(model.groups.map((g) => g.id)).not.toContain('app.ts');
    expect(model.columns.map((c) => c.label)).not.toContain('Composition');
    const onMap = new Set(model.groups.map((g) => g.id));
    expect(
      model.edges.flatMap((e) => [e.from, e.to]).every((id) => onMap.has(displayOwner(id))),
    ).toBe(true);
    const registered = model.groups.find((g) => g.id === 'AuthController')?.tags;
    expect(registered?.map((t) => t.label)).not.toContain('Compositionとの関係あり');
  });
  it('hides the library column like any other column', () => {
    const view = initialView(graph);
    const model = presentMap(graph, {
      ...view,
      options: { ...view.options, hiddenColumns: ['column:composition', 'column:6'] },
    });
    expect(model.groups.map((g) => g.id)).not.toContain('JwtService');
    expect(model.groups.find((g) => g.id === 'AuthService')?.tags).toEqual([]);
    const applied = model.groups.find((g) => g.id === 'AuthController')?.tags.map((t) => t.label);
    expect(applied).toContain('適用: Logging');
    expect(applied).not.toContain('適用: Jwt');
  });
  it('orders applied tags by the chain the request runs through, not by the JSON order', () => {
    const model = presentMap(graph, initialView(graph));
    const applied = model.groups.find((g) => g.id === 'CartController')?.tags.map((t) => t.label);
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
