import { describe, expect, it } from 'vitest';
import { fixture } from './fixture.lib';
import type { UnitSetup } from './snapshot.types';
import { summarizeSetup, unitCoverage, unitRows } from './test-presenter.lib';

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
