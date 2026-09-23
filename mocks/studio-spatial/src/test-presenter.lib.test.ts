import { describe, expect, it } from 'vitest';
import { fixture } from './fixture.lib';
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
  it('keeps unresolved setup classification unknown', () => {
    expect(
      summarizeSetup({ ...identity, resolution: 'unresolved', reason: 'dynamic-setup' }),
    ).toEqual({ style: '未判定', mocks: '未確認' });
  });
  it('lists the six observed JwtService tests as Solitary with no mocked class', () => {
    const declarations = [...fixture().declarations.values()];
    expect(unitRows(declarations)).toHaveLength(6);
    expect(
      unitRows(declarations).every((row) => row.style === 'Solitary' && row.mocks === 'なし'),
    ).toBe(true);
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
  it('moves the fixture lists onto the sixteen route methods', () => {
    const declarations = [...fixture().declarations.values()];
    expect(endpointModels(declarations)).toHaveLength(16);
    expect(
      endpointModels(declarations.filter((d) => d.id === 'ProductController.create')),
    ).toMatchObject([{ label: 'POST /api/products/' }]);
  });
});
