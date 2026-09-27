import { describe, expect, it } from 'vitest';
import { fixture, identity as subjectId } from './fixture';
import type { EndpointTests, UnitSetup } from './snapshot.types';
import { declaration } from './snapshot-builder.lib';
import { endpointModels, summarizeSetup, unitCoverage, unitRows } from './test-presenter.lib';

const service = { filePath: 'service.ts', name: 'Service' };
const otherService = { filePath: 'other-service.ts', name: 'Service' };
const config = { filePath: 'config.ts', name: 'Config' };
const identity = {
  id: 'setup',
  targetClass: service,
  location: { filePath: 'subject.test.ts', startLine: 1, endLine: 5 },
};
const setup: Extract<UnitSetup, { resolution: 'resolved' }> = {
  ...identity,
  resolution: 'resolved',
  dependencies: [],
  configs: [],
  overrides: [],
};

describe('test list semantics use Zelt setup, not package imports', () => {
  it('classifies real service dependencies as Sociable', () => {
    expect(
      summarizeSetup({ ...setup, dependencies: [{ kind: 'service', provide: service }] }),
    ).toEqual({ style: 'Sociable', mocks: 'なし' });
  });
  it('classifies fully mocked service dependencies as Solitary', () => {
    expect(
      summarizeSetup({
        ...setup,
        dependencies: [{ kind: 'service', provide: service }],
        overrides: [{ provide: service }],
      }),
    ).toEqual({ style: 'Solitary', mocks: 'Service' });
  });
  it('does not conflate identically named classes from different files', () => {
    expect(
      summarizeSetup({
        ...setup,
        dependencies: [{ kind: 'service', provide: otherService }],
        overrides: [{ provide: service }],
      }),
    ).toEqual({ style: 'Sociable', mocks: 'Service' });
  });
  it('does not count config value replacement as a mocked collaborator', () => {
    expect(
      summarizeSetup({
        ...setup,
        dependencies: [{ kind: 'config', provide: config }],
        configs: [config],
      }),
    ).toEqual({ style: 'Solitary', mocks: 'なし' });
  });
  it('classifies a module function called directly as a function test', () => {
    expect(summarizeSetup(null)).toEqual({ style: '関数', mocks: '—' });
  });
  it('keeps unresolved setup classification unknown', () => {
    expect(
      summarizeSetup({ ...identity, resolution: 'unresolved', reason: 'dynamic-setup' }),
    ).toEqual({ style: '未判定', mocks: '未確認' });
  });
  it('does not collect the tests of external packages, and says so instead of "none"', () => {
    const graph = fixture();
    const jwt = graph.groups.get(subjectId(graph, 'JwtService'));
    expect(unitRows(jwt?.members ?? [])).toEqual([]);
    expect(unitCoverage(jwt?.members ?? [])).toBe('未収録（テストの有無は未確認）');
  });
  it('lists the fixture Unit tests with the classification their Zelt setup gives', () => {
    const graph = fixture();
    const rows = (name: string) =>
      unitRows([...(graph.groups.get(subjectId(graph, name))?.members ?? [])]).map((r) => [
        r.targetLabel,
        r.style,
        r.mocks,
      ]);
    const cart = rows('CartService');
    expect(cart).toContainEqual(['addItem', 'Solitary', 'MemoryKVAdaptor, ProductService']);
    expect(cart).toContainEqual(['addItem', 'Sociable', 'なし']);
    expect(rows('current-user.lib.ts')).toContainEqual(['requireUser', '関数', '—']);
    expect(rows('LoggingMiddleware')).toEqual([]);
    expect(
      unitRows([...(graph.groups.get(subjectId(graph, 'auth.schema.ts'))?.members ?? [])]),
    ).toEqual([]);
  });
  it('names the searched scope and how many files were read instead of listing every file', () => {
    const covered = declaration('Service.run', {
      unitTests: {
        cases: [],
        coverage: {
          status: 'complete-in-scope',
          searchScope: ['src/**/*.test.ts'],
          inspectedFiles: ['src/a.test.ts', 'src/b.test.ts'],
        },
      },
    });
    expect(unitCoverage([covered])).toBe(
      '収録範囲: src/**/*.test.ts（2ファイル）。範囲外は未確認。',
    );
  });
  it('does not equate an empty local list with absence of tests in the project', () => {
    expect(unitCoverage([])).toContain('範囲外は未確認');
    expect(unitCoverage([])).not.toContain('ec-backend内にUnit testファイルなし');
  });
});

describe('E2E lists are read from the declaration that registered the route', () => {
  const tests: EndpointTests = {
    cases: [
      {
        id: 'e2e',
        name: 'creates an item',
        suite: ['items.e2e.test.ts', 'POST'],
        location: { filePath: 'test/items.e2e.test.ts', startLine: 3, endLine: 9 },
        requests: [],
      },
    ],
    coverage: {
      status: 'partial',
      searchScope: [],
      inspectedFiles: [],
      includesSharedSetup: false,
    },
  };
  it('titles the list with every hint label of the declaration', () => {
    const route = declaration('["route"]', {
      name: 'create',
      hints: [
        { provider: 'zelt', label: 'POST /api/items' },
        { provider: 'zelt', label: 'PUT /api/items' },
      ],
      e2eTests: tests,
    });
    expect(endpointModels([route])).toMatchObject([
      {
        id: '["route"]',
        label: 'POST /api/items · PUT /api/items',
        rows: [{ name: 'creates an item' }],
      },
    ]);
  });
  it('falls back to the declaration name and skips declarations without a route', () => {
    const route = declaration('["route"]', { name: 'create', e2eTests: tests });
    expect(endpointModels([route, declaration('["plain"]')]).map((m) => m.label)).toEqual([
      'create',
    ]);
  });
  it('says a sampled scope covers only part, even when no test matched', () => {
    const route = declaration('["route"]', {
      name: 'create',
      e2eTests: {
        cases: [],
        coverage: {
          status: 'partial',
          searchScope: ['e2e/product.spec.ts'],
          inspectedFiles: ['e2e/product.spec.ts'],
          includesSharedSetup: false,
        },
      },
    });
    expect(endpointModels([route])).toMatchObject([
      {
        coverage:
          '一部のみ · 0件（収録範囲: e2e/product.spec.ts）。範囲外は未確認。requestとの対応であり、method実行の保証ではありません。',
      },
    ]);
  });
  it('moves the fixture lists onto the sixteen route methods', () => {
    const graph = fixture();
    const declarations = [...graph.declarations.values()];
    expect(endpointModels(declarations)).toHaveLength(16);
    const create = subjectId(graph, 'ProductController#create');
    expect(endpointModels(declarations.filter((d) => d.id === create))).toMatchObject([
      { label: 'POST /api/products' },
    ]);
  });
});
