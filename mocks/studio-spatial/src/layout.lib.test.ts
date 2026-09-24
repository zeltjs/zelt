import { describe, expect, it } from 'vitest';
import { required } from './graph.lib';
import { presentInspector } from './inspector-presenter.lib';
import { isOnMap, layout, position } from './layout.lib';
import { declaration, graphOf, group } from './snapshot-builder.lib';
import { initialView } from './state.lib';
import type { ViewState } from './state.types';

const zelt = (label: string) => ({ provider: 'zelt', label });

function columnOrder(ids: readonly string[], view: ViewState, graph: ReturnType<typeof graphOf>) {
  const boxes = layout(graph, view).boxes;
  return [...ids].sort((a, b) => required(boxes, a).y - required(boxes, b).y);
}

describe('layout orders groups inside a column by source position, not by calls or JSON order', () => {
  const at = (filePath: string, startLine = 1) => ({ filePath, startLine });
  it('sorts by the full file path, folders included', () => {
    const graph = graphOf([
      group('Zeta', [declaration('Zeta.run')], at('src/b/zeta.ts')),
      group('Beta', [declaration('Beta.run', { calls: ['Alpha.run'] })], at('src/a/z.ts')),
      group('Alpha', [declaration('Alpha.run')], at('packages/x/alpha.ts')),
      group('Gamma', [declaration('Gamma.run', { calls: ['Beta.run'] })], at('src/app.ts')),
    ]);
    expect(columnOrder(['Zeta', 'Beta', 'Alpha', 'Gamma'], initialView(graph), graph)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
      'Zeta',
    ]);
  });
  it('sorts groups of one file by their start line', () => {
    const graph = graphOf([
      group('Late', [declaration('Late.run')], at('src/kv.ts', 37)),
      group('File', [declaration('File.run')], at('src/kv.ts', 1)),
      group('Early', [declaration('Early.run')], at('src/kv.ts', 19)),
    ]);
    expect(columnOrder(['Late', 'File', 'Early'], initialView(graph), graph)).toEqual([
      'File',
      'Early',
      'Late',
    ]);
  });
  it('orders each column on its own', () => {
    const graph = graphOf([
      group('Bravo', [declaration('Bravo.run')], at('src/b.ts')),
      group('Alpha', [declaration('Alpha.run')], at('src/a.ts')),
      group('Delta', [declaration('Delta.run')], { column: 'column:1', ...at('src/a.ts') }),
      group('Charlie', [declaration('Charlie.run')], { column: 'column:1', ...at('src/b.ts') }),
    ]);
    const boxes = layout(graph, initialView(graph)).boxes;
    expect(required(boxes, 'Alpha').y).toBe(required(boxes, 'Delta').y);
    expect(columnOrder(['Bravo', 'Alpha'], initialView(graph), graph)).toEqual(['Alpha', 'Bravo']);
    expect(columnOrder(['Charlie', 'Delta'], initialView(graph), graph)).toEqual([
      'Delta',
      'Charlie',
    ]);
  });
});

describe('an expanded group lists its members in source order, not in JSON order', () => {
  const graph = graphOf([
    group('Service', [
      declaration('Service.run', { startLine: 30 }),
      declaration('Service.constructor', { startLine: 12 }),
      declaration('Service.run@callback:0', { startLine: 31 }),
      declaration('Service.store', { startLine: 9 }),
    ]),
  ]);
  it('stacks member rows by their start line', () => {
    const view = { ...initialView(graph), expanded: ['Service'] };
    const geometry = layout(graph, view);
    const ids = ['Service.run', 'Service.constructor', 'Service.run@callback:0', 'Service.store'];
    const top = (id: string) => position(graph, view, geometry, id).y;
    expect([...ids].sort((a, b) => top(a) - top(b))).toEqual([
      'Service.store',
      'Service.constructor',
      'Service.run',
      'Service.run@callback:0',
    ]);
  });
  it('lists the inspector members in the same order', () => {
    expect(presentInspector(graph, 'Service')?.members.map((m) => m.id)).toEqual([
      'Service.store',
      'Service.constructor',
      'Service.run',
      'Service.run@callback:0',
    ]);
  });
});

describe('layout stacks the current group heights', () => {
  const graph = graphOf([
    group('Alpha', [declaration('Alpha.run', { calls: ['Beta.run'] }), declaration('Alpha.stop')], {
      filePath: 'src/alpha.ts',
    }),
    group('Beta', [declaration('Beta.run', { calls: ['Gamma.run'] })], { filePath: 'src/beta.ts' }),
    group('Gamma', [declaration('Gamma.run')], { filePath: 'src/gamma.ts' }),
    group('Service', [declaration('Service.run')], { column: 'column:1' }),
  ]);
  it('starts every column at the same top and keeps one gap between groups', () => {
    const boxes = layout(graph, initialView(graph)).boxes;
    const [alpha, beta, gamma, service] = ['Alpha', 'Beta', 'Gamma', 'Service'].map((id) =>
      required(boxes, id),
    );
    if (!alpha || !beta || !gamma || !service) throw new Error('Missing box');
    expect(service.y).toBe(alpha.y);
    const gap = beta.y - (alpha.y + alpha.height);
    expect(gap).toBeGreaterThan(0);
    expect(gamma.y - (beta.y + beta.height)).toBe(gap);
  });
  it('moves only the following groups by the height an expansion adds', () => {
    const collapsed = layout(graph, initialView(graph)).boxes;
    const expanded = layout(graph, { ...initialView(graph), expanded: ['Alpha'] }).boxes;
    const added = required(expanded, 'Alpha').height - required(collapsed, 'Alpha').height;
    expect(added).toBeGreaterThan(0);
    expect(required(expanded, 'Alpha').y).toBe(required(collapsed, 'Alpha').y);
    expect(required(expanded, 'Beta').y - required(collapsed, 'Beta').y).toBe(added);
    expect(required(expanded, 'Gamma').y - required(collapsed, 'Gamma').y).toBe(added);
    expect(required(expanded, 'Service')).toEqual(required(collapsed, 'Service'));
  });
  it('keeps the same positions when only the selection changes', () => {
    const view = { ...initialView(graph), expanded: ['Beta'] };
    const baseline = layout(graph, view);
    for (const node of ['Alpha', 'Beta.run', 'Gamma', 'Service.run'])
      expect(layout(graph, { ...view, node })).toEqual(baseline);
  });
  it('grows a declaration row by one line for each additional hint', () => {
    const hinted = graphOf([
      group('Alpha', [
        declaration('Alpha.run', { hints: [zelt('GET /a'), zelt('GET /b')] }),
        declaration('Alpha.stop'),
      ]),
      group('Beta', [
        declaration('Beta.run', { hints: [zelt('GET /c')] }),
        declaration('Beta.stop'),
      ]),
    ]);
    const view = { ...initialView(hinted), expanded: ['Alpha', 'Beta'] };
    const geometry = layout(hinted, view);
    const line = required(geometry.boxes, 'Alpha').height - required(geometry.boxes, 'Beta').height;
    expect(line).toBe(17);
    const offset = (id: string) => position(hinted, view, geometry, id).y;
    expect(offset('Alpha.stop') - offset('Alpha.run')).toBe(
      offset('Beta.stop') - offset('Beta.run') + line,
    );
  });
});

describe('a hidden column takes no room and its groups leave the map', () => {
  const columns = [
    { id: 'column:app', label: 'Composition', initiallyHidden: true },
    { id: 'column:0', label: 'Entry' },
    { id: 'column:1', label: 'Use case' },
  ];
  const graph = graphOf(
    [
      group('App', [declaration('App.create')], { column: 'column:app' }),
      group('Controller', [declaration('Controller.run')]),
      group('Service', [declaration('Service.run')], { column: 'column:1' }),
    ],
    columns,
  );
  it('starts hidden columns hidden and moves the following columns left', () => {
    const view = initialView(graph);
    expect(view.options.hiddenColumns).toEqual(['column:app']);
    const boxes = layout(graph, view).boxes;
    expect(required(boxes, 'Controller').x).toBe(14);
    expect(required(boxes, 'Service').x).toBe(310 + 14);
    const shown = layout(graph, { ...view, options: { ...view.options, hiddenColumns: [] } });
    expect(required(shown.boxes, 'Controller').x).toBe(310 + 14);
    expect(shown.width - layout(graph, view).width).toBe(310);
  });
  it('keeps hidden groups off the map', () => {
    const view = initialView(graph);
    const onMap = [...graph.groups.values()]
      .filter((g) => isOnMap(g, view.options))
      .map((g) => g.id);
    expect(onMap).toEqual(['Controller', 'Service']);
  });
});
