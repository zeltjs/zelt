import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { array, boolean, literal, null_, object, parse, string, union } from 'valibot';
import { describe, expect, it } from 'vitest';
import { fixture } from './fixture.lib';
import { presentMap } from './map-presenter.lib';
import { scopeRelations } from './scope.lib';
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

describe('Presenter preserves the pre-React display contract', () => {
  it.each(
    golden,
  )('matches legacy projection: $node/$mode expanded=$expanded config=$showConfig types=$showTypes', (test) => {
    const view: ViewState = {
      ...initialView(),
      node: test.node,
      scope: { kind: 'following', mode: test.mode },
      expanded: test.expanded ? [...graph.groups.keys()] : [],
      options: { showConfig: test.showConfig, showTypes: test.showTypes, showCounts: true },
    };
    const model = presentMap(graph, view);
    const groups = model.groups.map((g) => ({
      id: g.id,
      rect: g.rect,
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
    const json = JSON.stringify({ groups, wires, width: model.width, height: model.height });
    expect(createHash('sha256').update(json).digest('hex')).toBe(test.hash);
  });
  it('keeps every collapsed attachment at the same emphasis as its owner', () => {
    for (const node of graph.owners.keys()) {
      const model = presentMap(graph, { ...initialView(), node });
      for (const group of model.groups)
        for (const tag of group.tags) expect(tag.dimmed).toBe(group.dimmed);
    }
  });
  it('does not mutate source data or widen traversal when folding or hiding config/types', () => {
    const before = JSON.stringify(graph.snapshot);
    const view: ViewState = {
      ...initialView(),
      node: 'OrderService.findById',
      scope: { kind: 'following', mode: 'flow' },
    };
    const expected = scopeRelations(graph, view);
    const altered = {
      ...view,
      expanded: [...graph.groups.keys()],
      options: { showTypes: false, showCounts: false, showConfig: false },
    };
    presentMap(graph, altered);
    expect(scopeRelations(graph, altered)).toEqual(expected);
    expect(JSON.stringify(graph.snapshot)).toBe(before);
  });
  it('does not switch direction at shared dependencies', () => {
    const view: ViewState = {
      ...initialView(),
      node: 'ProductController.create',
      scope: { kind: 'following', mode: 'flow' },
    };
    const edges = scopeRelations(graph, view);
    expect(edges.some((e) => e.from === 'ProductService.create')).toBe(true);
    expect(edges.some((e) => e.from === 'OrderController.create')).toBe(false);
    expect(edges.some((e) => e.kind === 'middleware')).toBe(false);
  });
});
