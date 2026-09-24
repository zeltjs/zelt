import { describe, expect, it } from 'vitest';

import { assemble } from './assemble.lib';
import type { AssemblyInput, PluginContribution } from './assemble.types';
import type { SourceFacts } from './core-facts.types';
import type { ResolvedConfig } from './extract-config.lib';
import type { Evidence, Material, Span } from './plugin.types';
import { canonicalJson } from './snapshot-canonical.lib';

const span: Span = { filePath: 'app/a.ts', start: 0, end: 5, startLine: 1, endLine: 1 };
const evidence = (provider: string): Evidence[] => [{ provider, span, basis: 'syntax' }];

const detail = {
  location: { filePath: 'app/a.ts', startLine: 1, endLine: 1 },
  signature: 's',
  excerpt: { kind: 'declaration-only' },
} as const;

const facts: SourceFacts = {
  groups: [
    {
      id: 'g:Service',
      name: 'Service',
      kind: 'class',
      filePath: 'app/service.ts',
      expansion: 'included',
      source: detail,
      position: 0,
    },
    {
      id: 'g:helpers',
      name: 'helpers.ts',
      kind: 'file',
      filePath: 'app/helpers.ts',
      expansion: 'included',
      source: detail,
      position: 0,
    },
  ],
  declarations: [
    {
      id: 'd:Service.run',
      groupId: 'g:Service',
      name: 'run',
      kind: 'method',
      enclosingDeclarationId: null,
      source: detail,
      position: 10,
    },
    {
      id: 'd:helper',
      groupId: 'g:helpers',
      name: 'helper',
      kind: 'function',
      enclosingDeclarationId: null,
      source: detail,
      position: 0,
    },
  ],
  relations: [
    {
      ownerId: 'd:Service.run',
      to: 'd:helper',
      kind: 'call',
      evidence: [{ location: detail.location, expression: 'helper()' }],
    },
  ],
  inspectedFiles: ['app/service.ts', 'app/helpers.ts'],
};

const config = (overrides: Partial<ResolvedConfig['raw']> = {}): ResolvedConfig => ({
  raw: {
    version: 1,
    project: { id: 'demo', name: 'Demo' },
    root: '.',
    tsconfig: 'tsconfig.json',
    include: ['app/**/*.ts'],
    exclude: [],
    mapPackages: [],
    ignore: [],
    sourceText: [],
    sourceModules: {},
    plugins: [],
    presentation: {
      id: 'demo',
      columns: [
        { id: 'column:a', label: 'A', width: 1, initiallyHidden: false },
        { id: 'column:empty', label: 'Empty', width: 1, initiallyHidden: true },
      ],
      rules: [],
      fallbackColumnId: 'column:a',
    },
    required: [],
    output: 'out.json',
    ...overrides,
  },
  configFile: '/repo/x.extract.json',
  root: '/repo',
  tsconfig: '/repo/tsconfig.json',
  output: '/repo/out.json',
  sourceModules: {},
  isIncluded: () => true,
  isSourceTextAllowed: () => false,
  columnIdFor: () => 'column:a',
});

const input = (
  plugins: PluginContribution[],
  raw: Partial<ResolvedConfig['raw']> = {},
): AssemblyInput => ({
  config: config(raw),
  facts,
  plugins,
  readSpan: () => 'expr',
});

describe('assemble', () => {
  it('publishes core facts with empty plugin-owned fields', () => {
    const result = assemble(input([]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const snapshot = result.snapshot;
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.provenance).toBe('extracted');
    expect(snapshot.project).toEqual({ id: 'demo', name: 'Demo' });
    const member = snapshot.graph.groups.find((g) => g.name === 'Service')?.members[0];
    expect(member).toBeDefined();
    if (member === undefined) return;
    expect(member.relations[0]?.kind).toBe('call');
    expect(member.meanings).toEqual([]);
    expect(member.e2eTests).toBeNull();
    expect(member.unitTests.coverage.status).toBe('uncollected');
  });

  it('does not publish a column that holds no group', () => {
    const result = assemble(input([]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.graph.presentation.columns.map((c) => c.id)).toEqual(['column:a']);
  });

  it('adds a plugin meaning to a core relation without changing its kind', () => {
    const relationId = `relation:${JSON.stringify(['d:Service.run', 'd:helper', 'call'])}`;
    const materials: Material[] = [
      { kind: 'meaning', subject: relationId, meaning: 'schema', evidence: evidence('valibot') },
    ];
    const result = assemble(input([{ id: 'valibot', materials, reports: [] }]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const relation = result.snapshot.graph.groups
      .flatMap((g) => g.members)
      .flatMap((m) => m.relations)
      .find((r) => r.origin === 'ts');
    expect(relation?.kind).toBe('call');
    expect(relation?.origin === 'ts' ? relation.meanings : []).toEqual([
      { provider: 'valibot', kind: 'schema' },
    ]);
  });

  it('fails when a plugin grants a relation that core already states', () => {
    const materials: Material[] = [
      {
        kind: 'relation',
        from: 'd:Service.run',
        to: 'd:helper',
        relation: 'middleware',
        applicationId: null,
        order: 0,
        evidence: evidence('zelt'),
      },
    ];
    const result = assemble(input([{ id: 'zelt', materials, reports: [] }]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures[0]?.code).toBe('duplicate-relation');
  });

  it('fails when a plugin points at a subject that is not on the map', () => {
    const materials: Material[] = [
      { kind: 'hint', subject: 'd:missing', label: 'POST /x', evidence: evidence('zelt') },
    ];
    const result = assemble(input([{ id: 'zelt', materials, reports: [] }]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures[0]?.code).toBe('unknown-subject');
  });

  it('fails when a required feature has no complete-in-scope report', () => {
    const result = assemble(input([], { required: [{ provider: 'zelt', feature: 'routes' }] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures[0]?.code).toBe('required-feature-missing');
  });

  it('publishes a required feature without a plugin when the gate is turned off', () => {
    const result = assemble({
      ...input([], { required: [{ provider: 'zelt', feature: 'routes' }] }),
      enforceRequired: false,
    });
    expect(result.ok).toBe(true);
  });

  it('gives the same snapshotId for the same facts regardless of plugin order', () => {
    const a: PluginContribution = { id: 'a', materials: [], reports: [] };
    const b: PluginContribution = { id: 'b', materials: [], reports: [] };
    const first = assemble(input([a, b]));
    const second = assemble(input([b, a]));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.snapshot.snapshotId).toBe(second.snapshot.snapshotId);
  });
});

describe('canonicalJson', () => {
  it('sorts object keys so the same value always hashes the same', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });
});
