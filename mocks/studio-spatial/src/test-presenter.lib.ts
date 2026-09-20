import type { EndpointModel, UnitRow } from './display.types';
import type { ClassReference, SourceDeclaration, UnitSetup } from './snapshot.types';

function classKey(ref: ClassReference): string {
  return `${ref.filePath}:${ref.name}`;
}

export function summarizeSetup(setup: UnitSetup): {
  readonly style: string;
  readonly mocks: string;
} {
  if (setup.resolution === 'unresolved') return { style: '未判定', mocks: '未確認' };
  const mocked = new Set(setup.overrides.map((o) => classKey(o.provide)));
  const real = setup.dependencies.some(
    (d) => d.kind === 'service' && !mocked.has(classKey(d.provide)),
  );
  const names = [...new Set(setup.overrides.map((o) => o.provide.name))];
  return { style: real ? 'Sociable' : 'Solitary', mocks: names.length ? names.join(', ') : 'なし' };
}

export function unitRows(declarations: readonly SourceDeclaration[]): readonly UnitRow[] {
  return declarations.flatMap((d) =>
    d.unitTests.cases.flatMap((test) => {
      const setups = new Map(test.calls.map((call) => [call.setup.id, call.setup]));
      return [...setups.values()].map((setup) => ({
        key: `${d.id}:${test.id}:${setup.id}`,
        name: test.name,
        target: d.id,
        targetLabel: d.name,
        title: `${test.suite.join(' / ')}\n${test.location.filePath}:${test.location.startLine}`,
        ...summarizeSetup(setup),
      }));
    }),
  );
}

export function unitCoverage(declarations: readonly SourceDeclaration[]): string {
  const coverage = declarations.map((d) => d.unitTests.coverage);
  if (coverage.some((c) => c.status === 'uncollected')) return '未収録（テストの有無は未確認）';
  const files = [...new Set(coverage.flatMap((c) => c.inspectedFiles))];
  if (files.length) return `収録範囲: ${files.join(', ')}。範囲外は未確認。`;
  return 'この宣言に対応する収録済みUnit testなし。調査対象ファイル・範囲外は未確認。';
}

export function endpointModels(
  declarations: readonly SourceDeclaration[],
): readonly EndpointModel[] {
  return declarations.flatMap((d) =>
    d.entries.flatMap((entry) => {
      if (entry.kind !== 'http') return [];
      const tests = entry.e2eTests;
      const coverage =
        tests.coverage.status === 'uncollected'
          ? '未収録（テストの有無は未確認）'
          : '収録: test本体内request（準備を含む）。共通setup・他ファイルは未収録。method実行の保証ではありません。';
      return [
        {
          id: entry.id,
          label: `${entry.method} ${entry.path}`,
          coverage,
          rows: tests.cases.map((test) => ({
            id: test.id,
            name: test.name,
            suite: test.suite.slice(1).join(' / '),
            source: `${test.location.filePath.split('/').at(-1)}:${test.location.startLine}`,
            title: test.location.filePath,
          })),
        },
      ];
    }),
  );
}
