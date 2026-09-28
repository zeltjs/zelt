import { describe, expect, it } from 'vitest';
import { attachments, relationPart } from './relations.lib';
import { declaration, granted, graphOf, group, relation } from './snapshot-builder.lib';

const columns = [
  { id: 'column:0', label: 'Entry' },
  { id: 'column:1', label: 'Use case' },
  { id: 'column:lib', label: 'ライブラリ' },
];
const graph = graphOf(
  [
    group('Controller', [
      declaration('Controller.create', {
        relations: [
          relation('Controller.create', 'Service.run'),
          relation('Controller.create', 'Library.sign'),
          granted('Controller.create', 'Guard.use', 'middleware'),
        ],
      }),
    ]),
    group(
      'Service',
      [
        declaration('Service.run', {
          relations: [
            granted('Service.run', 'Handler.on', 'event'),
            relation('Service.run', 'Library.sign'),
          ],
        }),
      ],
      { column: 'column:1' },
    ),
    group('Handler', [declaration('Handler.on')]),
    group(
      'Library',
      [declaration('Library.sign', { calls: ['Library.verify'] }), declaration('Library.verify')],
      {
        column: 'column:lib',
      },
    ),
    group('Guard', [declaration('Guard.use')], { column: 'column:lib' }),
  ],
  columns,
);
const find = (from: string, to: string) => {
  const edge = graph.relations.find((r) => r.from === from && r.to === to);
  if (!edge) throw new Error(`Missing ${from} -> ${to}`);
  return edge;
};

describe('chips come from granted relation kinds, and hidden columns show nothing', () => {
  it('draws a call between visible columns as a wire', () => {
    expect(relationPart(graph, find('Controller.create', 'Service.run'), [])).toBe('wires');
  });
  it('keeps event delivery as a chip on both ends', () => {
    expect(relationPart(graph, find('Service.run', 'Handler.on'), [])).toBe('warp');
    expect(
      attachments(graph, [])
        .filter((a) => a.kind === 'event')
        .map((a) => [a.groupId, a.incoming]),
    ).toEqual([
      ['Service', false],
      ['Handler', true],
    ]);
  });
  it('leaves no chip on the visible end when the other column is hidden', () => {
    const hidden = ['column:lib'];
    expect(relationPart(graph, find('Controller.create', 'Library.sign'), hidden)).toBe('hidden');
    expect(relationPart(graph, find('Service.run', 'Library.sign'), hidden)).toBe('hidden');
    expect(attachments(graph, hidden).map((a) => [a.groupId, a.kind])).toEqual([
      ['Service', 'event'],
      ['Handler', 'event'],
    ]);
  });
  it('gives a hidden column no chip for relations inside it', () => {
    const hidden = ['column:lib'];
    expect(relationPart(graph, find('Library.sign', 'Library.verify'), hidden)).toBe('hidden');
    expect(attachments(graph, hidden).map((a) => a.groupId)).not.toContain('Library');
  });
  it('drops middleware and event chips whose other end is in a hidden column', () => {
    expect(relationPart(graph, find('Controller.create', 'Guard.use'), ['column:lib'])).toBe(
      'hidden',
    );
    expect(attachments(graph, ['column:lib']).map((a) => a.kind)).not.toContain('middleware');
    expect(relationPart(graph, find('Service.run', 'Handler.on'), ['column:1'])).toBe('hidden');
    expect(attachments(graph, ['column:1']).map((a) => a.kind)).not.toContain('event');
  });
});
