import { describe, expect, it } from 'vitest';

import { assembleTests } from './assemble-tests.lib';
import type { AnalysisReport, ClassRef, Material, Span, TestCall } from './plugin.types';

const span = (filePath: string, start: number, end: number, line = start): Span => ({
  filePath,
  start,
  end,
  startLine: line,
  endLine: line,
});

const TARGET: ClassRef = { filePath: 'src/thing.service.ts', name: 'ThingService' };
const OTHER: ClassRef = { filePath: 'src/other.service.ts', name: 'OtherService' };

const report = (
  provider: string,
  feature: AnalysisReport['feature'],
  category: 'unit' | 'e2e',
  status: AnalysisReport['status'],
): AnalysisReport => ({
  id: `${provider}/${feature}/${category}`,
  provider,
  feature,
  status,
  scope: { files: [`${category}/**`], category },
  inspectedFiles: [`${category}/a.test.ts`],
  diagnostics: [],
});

const setupMaterial: Material = {
  kind: 'test-setup',
  value: {
    factoryCall: 'call:unit/a.test.ts:10',
    resultPath: ['target'],
    targetClass: TARGET,
    location: span('unit/a.test.ts', 10, 40, 3),
    analysis: {
      kind: 'zelt',
      detail: { dependencies: [{ provide: OTHER, kind: 'service' }], configs: [], overrides: [] },
    },
  },
};

const unitTest = (calls: readonly TestCall[]): Material => ({
  kind: 'test',
  value: {
    registration: 'unit/a.test.ts:5',
    caseKey: 'unit/a.test.ts:100',
    category: 'unit',
    name: 'does a thing',
    suite: ['ThingService'],
    location: span('unit/a.test.ts', 100, 200, 5),
    body: span('unit/a.test.ts', 120, 190, 5),
    mode: 'normal',
    calls,
  },
});

const sources = (materials: readonly Material[], reports: readonly AnalysisReport[] = []) => [
  { materials, reports },
];

describe('assembleTests', () => {
  it('binds a call to the setup that produced its receiver', () => {
    const assembly = assembleTests(
      sources(
        [
          setupMaterial,
          unitTest([
            {
              subject: 'decl:make',
              invocation: span('unit/a.test.ts', 130, 140, 6),
              origin: {
                kind: 'factory-result',
                factoryCall: 'call:unit/a.test.ts:10',
                path: ['target'],
              },
              ownerClass: TARGET,
            },
          ]),
        ],
        [report('vitest', 'tests', 'unit', 'complete-in-scope')],
      ),
    );
    const unit = assembly.unitTestsOf('decl:make');
    expect(unit.coverage.status).toBe('complete-in-scope');
    expect(unit.cases).toHaveLength(1);
    expect(unit.cases[0]?.calls[0]?.setup).toMatchObject({
      id: 'unit/a.test.ts:3',
      targetClass: TARGET,
      resolution: 'resolved',
    });
  });

  it('keeps a receiver-less call without a setup', () => {
    const assembly = assembleTests(
      sources(
        [
          unitTest([
            {
              subject: 'decl:fn',
              invocation: span('unit/a.test.ts', 130, 140, 6),
              origin: null,
              ownerClass: null,
            },
          ]),
        ],
        [report('vitest', 'tests', 'unit', 'complete-in-scope')],
      ),
    );
    expect(assembly.unitTestsOf('decl:fn').cases[0]?.calls[0]?.setup).toBeNull();
  });

  it('takes a value fetched by class only when the callee belongs to that class', () => {
    const fetched = (ownerClass: ClassRef) =>
      assembleTests(
        sources(
          [
            setupMaterial,
            unitTest([
              {
                subject: 'decl:other',
                invocation: span('unit/a.test.ts', 130, 140, 6),
                origin: {
                  kind: 'factory-result',
                  factoryCall: 'call:unit/a.test.ts:10',
                  path: [`get:${OTHER.filePath}#${OTHER.name}`],
                },
                ownerClass,
              },
            ]),
          ],
          [report('vitest', 'tests', 'unit', 'complete-in-scope')],
        ),
      ).unitTestsOf('decl:other').cases;
    expect(fetched(OTHER)[0]?.calls[0]?.setup?.targetClass).toEqual(TARGET);
    expect(fetched(TARGET)).toHaveLength(0);
  });

  it('leaves unit tests uncollected when no runner reported the scope', () => {
    const assembly = assembleTests(sources([setupMaterial]));
    expect(assembly.unitTestsOf('decl:make')).toEqual({
      cases: [],
      coverage: { status: 'uncollected', searchScope: [], inspectedFiles: [] },
    });
  });

  it('binds a request to the route with the same app, method and path', () => {
    const materials: Material[] = [
      {
        kind: 'route',
        subject: 'decl:detail',
        registrationKey: 'GET /api/things/:id',
        applicationId: 'ec',
        method: 'GET',
        path: '/api/things/:id',
        evidence: [],
      },
      {
        kind: 'route',
        subject: 'decl:list',
        registrationKey: 'GET /api/things',
        applicationId: 'ec',
        method: 'GET',
        path: '/api/things',
        evidence: [],
      },
      {
        kind: 'application',
        value: { factoryCall: 'call:e2e/a.test.ts:1', resultPath: [], applicationId: 'ec' },
      },
      {
        kind: 'test',
        value: {
          registration: 'e2e/a.test.ts:5',
          caseKey: 'e2e/a.test.ts:100',
          category: 'e2e',
          name: 'reads one thing',
          suite: ['Thing API'],
          location: span('e2e/a.test.ts', 100, 200, 5),
          body: span('e2e/a.test.ts', 120, 190, 5),
          mode: 'normal',
          calls: [],
        },
      },
      {
        kind: 'request',
        value: {
          invocation: span('e2e/a.test.ts', 130, 150, 6),
          application: { kind: 'factory-result', factoryCall: 'call:e2e/a.test.ts:1', path: [] },
          method: 'GET',
          path: '/api/things/${}',
          via: 'direct',
        },
      },
    ];
    const assembly = assembleTests(
      sources(materials, [report('http-requests', 'requests', 'e2e', 'partial')]),
    );
    const detail = assembly.e2eTestsOf('decl:detail');
    expect(detail?.coverage).toEqual({
      status: 'partial',
      searchScope: ['e2e/**'],
      inspectedFiles: ['e2e/a.test.ts'],
      includesSharedSetup: false,
    });
    expect(detail?.cases[0]?.requests).toEqual([
      { location: { filePath: 'e2e/a.test.ts', startLine: 6, endLine: 6 }, via: 'direct' },
    ]);
    // 一致する request が無い route は「一部のみ・0件」で、未取得にはしない(4.4)
    expect(assembly.e2eTestsOf('decl:list')?.cases).toEqual([]);
    expect(assembly.e2eTestsOf('decl:make')).toBeNull();
  });
});
