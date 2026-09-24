import { describe, expect, it } from 'vitest';
import { presentInspector } from './inspector-presenter.lib';
import { declaration, graphOf, group } from './snapshot-builder.lib';

const evidence = [
  {
    location: { filePath: 'src/sample.ts', startLine: 3, endLine: 3 },
    expression: 'inject(Service)',
  },
];
const graph = graphOf([
  group(
    'Controller',
    [
      declaration('Controller.constructor', {
        name: 'constructor',
        startLine: 3,
        setup: [
          {
            provider: 'zelt',
            kind: 'inject',
            label: 'inject(Service)',
            target: 'Service',
            evidence,
          },
          { provider: 'zelt', kind: 'inject', label: 'inject(Clock)', target: null, evidence },
        ],
      }),
      declaration('Controller.run', { startLine: 5 }),
    ],
    {
      setup: [
        {
          provider: 'zelt',
          kind: 'middleware',
          label: '@UseMiddleware(Guard)',
          target: null,
          evidence,
        },
      ],
    },
  ),
  group('Service', [declaration('Service.run')], { column: 'column:1' }),
]);

describe('the inspector shows setup apart from the flow on the map', () => {
  it('lists a declaration setup with its kind, provider and target', () => {
    expect(presentInspector(graph, 'Controller.constructor')?.setup).toEqual([
      {
        key: expect.any(String),
        owner: null,
        kind: '注入',
        provider: 'zelt',
        label: 'inject(Service)',
        target: { id: 'Service', name: 'Service' },
      },
      {
        key: expect.any(String),
        owner: null,
        kind: '注入',
        provider: 'zelt',
        label: 'inject(Clock)',
        target: null,
      },
    ]);
  });
  it('lists the group setup first, then each member setup under the member name', () => {
    expect(presentInspector(graph, 'Controller')?.setup.map((s) => [s.owner, s.label])).toEqual([
      [null, '@UseMiddleware(Guard)'],
      ['constructor', 'inject(Service)'],
      ['constructor', 'inject(Clock)'],
    ]);
  });
  it('has no setup section content for a declaration without setup', () => {
    expect(presentInspector(graph, 'Controller.run')?.setup).toEqual([]);
  });
});
