import type { EndpointModel, UnitRow } from './display.types';
import type { ClassReference, EndpointTests, SourceDeclaration, UnitSetup } from './snapshot.types';

function classKey(ref: ClassReference): string {
  return `${ref.filePath}:${ref.name}`;
}

export function summarizeSetup(setup: UnitSetup | null): {
  readonly style: string;
  readonly mocks: string;
} {
  if (setup === null) return { style: '関数', mocks: '—' };
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
      const setups = new Map(test.calls.map((call) => [call.setup?.id ?? null, call.setup]));
      return [...setups].map(([setupId, setup]) => ({
        key: `${d.id}:${test.id}:${setupId ?? 'direct'}`,
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
  const scope = [...new Set(coverage.flatMap((c) => c.searchScope))];
  if (files.length)
    return `収録範囲: ${scope.join(', ')}（${files.length}ファイル）。範囲外は未確認。`;
  return 'この宣言に対応する収録済みUnit testなし。調査対象ファイル・範囲外は未確認。';
}

function endpointCoverage(tests: EndpointTests): string {
  const { status, searchScope } = tests.coverage;
  if (status === 'uncollected') return '未収録（テストの有無は未確認）';
  if (status === 'partial')
    return `一部のみ · ${tests.cases.length}件（収録範囲: ${searchScope.join(', ')}）。範囲外は未確認。requestとの対応であり、method実行の保証ではありません。`;
  return '収録: test本体内request（準備を含む）。共通setup・他ファイルは未収録。method実行の保証ではありません。';
}

export function endpointModels(
  declarations: readonly SourceDeclaration[],
): readonly EndpointModel[] {
  return declarations.flatMap((d) => {
    const tests = d.e2eTests;
    if (tests === null) return [];
    const coverage = endpointCoverage(tests);
    return [
      {
        id: d.id,
        label: d.hints.length ? d.hints.map((h) => h.label).join(' · ') : d.name,
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
  });
}
