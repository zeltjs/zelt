import { describe, expect, it } from 'vitest';
import { attachments, relationPart } from './relations.lib';
import { declaration, graphOf, group, relation } from './snapshot-builder.lib';

const route = declaration('Controller.create', {
  hints: [{ provider: 'zelt', label: 'POST /api/items' }],
  e2eTests: {
    cases: [],
    coverage: {
      status: 'uncollected',
      searchScope: [],
      inspectedFiles: [],
      includesSharedSetup: false,
    },
  },
});
const graph = graphOf([
  group('Controller', [route]),
  group('Caller', [
    declaration('Caller.run', {
      relations: [
        relation('Caller.run', 'Controller.create'),
        relation('Caller.run', 'Handler.on', 'event'),
      ],
    }),
  ]),
  group('Handler', [declaration('Handler.on')]),
]);

describe('chips come from the relation kind only', () => {
  it('draws a cross-group call to a route method as a wire', () => {
    const call = graph.relations.find((r) => r.kind === 'call');
    if (!call) throw new Error('Missing call');
    expect(relationPart(graph, call, true)).toBe('wires');
    expect(attachments(graph, true).map((a) => a.kind)).not.toContain('call');
  });
  it('keeps event delivery as a chip on both ends', () => {
    const event = graph.relations.find((r) => r.kind === 'event');
    if (!event) throw new Error('Missing event');
    expect(relationPart(graph, event, true)).toBe('warp');
    expect(attachments(graph, true).map((a) => [a.groupId, a.kind, a.incoming])).toEqual([
      ['Caller', 'event', false],
      ['Handler', 'event', true],
    ]);
  });
});
