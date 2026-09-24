import type { Feature } from './extract-config.lib';
import type {
  AnalysisReport,
  ApplicationContribution,
  ClassRef,
  Material,
  RequestContribution,
  Span,
  TestContribution,
  TestSetupContribution,
  ValueOrigin,
} from './plugin.types';
import { compare } from './snapshot-canonical.lib';
import type {
  AssociationCoverage,
  EndpointTests,
  SourceLocation,
  UnitSetup,
  UnitTestCase,
  UnitTests,
} from './snapshot-schema.lib';
import { locationIdOf } from './test-scope.lib';

export type TestMaterialSource = {
  readonly materials: readonly Material[];
  readonly reports: readonly AnalysisReport[];
};

export type TestAssemblyFailure = { readonly code: string; readonly message: string };

export type TestAssembly = {
  readonly unitTestsOf: (subject: string) => UnitTests;
  readonly e2eTestsOf: (subject: string) => EndpointTests | null;
  readonly failures: readonly TestAssemblyFailure[];
};

const UNIT_FEATURES: readonly Feature[] = ['tests', 'unit-associations'];
const E2E_FEATURES: readonly Feature[] = ['tests', 'requests', 'e2e-associations'];

export const NO_UNIT_TESTS: UnitTests = {
  cases: [],
  coverage: { status: 'uncollected', searchScope: [], inspectedFiles: [] },
};

const locationOf = (span: Span): SourceLocation => ({
  filePath: span.filePath,
  startLine: span.startLine,
  endLine: span.endLine,
});

const sameClass = (a: ClassRef | null, b: ClassRef): boolean =>
  a !== null && a.filePath === b.filePath && a.name === b.name;

const samePath = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((segment, index) => segment === b[index]);

/** `get:<path>#<name>` は、その class として取り出した値であることを示す(付録F) */
const accessorClassOf = (path: readonly string[]): ClassRef | null => {
  const only = path.length === 1 ? path[0] : undefined;
  if (only === undefined || !only.startsWith('get:')) return null;
  const [filePath, name] = only.slice('get:'.length).split('#');
  return filePath === undefined || name === undefined ? null : { filePath, name };
};

const coverageOf = (
  reports: readonly AnalysisReport[],
  category: 'unit' | 'e2e',
  features: readonly Feature[],
): AssociationCoverage => {
  const selected = reports.filter(
    (report) => report.scope.category === category && features.includes(report.feature),
  );
  if (selected.length === 0) {
    return { status: 'uncollected', searchScope: [], inspectedFiles: [] };
  }
  const status = selected.some(
    (report) => report.status === 'uncollected' || report.status === 'disabled',
  )
    ? 'uncollected'
    : selected.some((report) => report.status === 'partial')
      ? 'partial'
      : 'complete-in-scope';
  return {
    status,
    searchScope: [...new Set(selected.flatMap((report) => [...report.scope.files]))],
    inspectedFiles: [...new Set(selected.flatMap((report) => [...report.inspectedFiles]))].sort(),
  };
};

const withinSpan = (outer: Span, inner: Span): boolean =>
  outer.filePath === inner.filePath && inner.start >= outer.start && inner.end <= outer.end;

/** route の `:parameter` はどの1 segment にも合う。固定 segment はテンプレートに合わせない(付録G) */
const pathMatches = (routePath: string, requestPath: string): boolean => {
  const route = routePath.split('/');
  const request = requestPath.split('/');
  if (route.length !== request.length) return false;
  return route.every((segment, index) =>
    segment.startsWith(':') ? true : segment === request[index],
  );
};

const toUnitSetup = (setup: TestSetupContribution): UnitSetup => {
  const identity = {
    id: locationIdOf(setup.location),
    targetClass: setup.targetClass,
    location: locationOf(setup.location),
  };
  if (setup.analysis.kind === 'zelt') {
    return {
      ...identity,
      resolution: 'resolved',
      dependencies: [...setup.analysis.detail.dependencies],
      configs: [...setup.analysis.detail.configs],
      overrides: [...setup.analysis.detail.overrides],
    };
  }
  return {
    ...identity,
    resolution: 'unresolved',
    reason: setup.analysis.kind === 'uncollected' ? 'not-collected' : setup.analysis.reason,
  };
};

/** 同じ registrationKey で登録された route の内容 */
type RouteEntry = {
  readonly subject: string;
  readonly applicationId: string;
  readonly method: string;
  readonly path: string;
};

type TestCollection = {
  readonly tests: TestContribution[];
  readonly setups: Map<string, TestSetupContribution>;
  readonly applications: ApplicationContribution[];
  readonly requests: RequestContribution[];
  readonly routes: Map<string, RouteEntry>;
  readonly failures: TestAssemblyFailure[];
};

const addTestSetup = (collected: TestCollection, value: TestSetupContribution): void => {
  const existing = collected.setups.get(value.factoryCall);
  if (existing !== undefined && !sameClass(existing.targetClass, value.targetClass)) {
    collected.failures.push({
      code: 'conflicting-test-setup',
      message: `two plugins claim different targets for the same setup: ${value.factoryCall}`,
    });
    return;
  }
  collected.setups.set(value.factoryCall, value);
};

const addRoute = (
  collected: TestCollection,
  material: Extract<Material, { kind: 'route' }>,
): void => {
  const existing = collected.routes.get(material.registrationKey);
  if (
    existing !== undefined &&
    (existing.method !== material.method || existing.path !== material.path)
  ) {
    collected.failures.push({
      code: 'conflicting-route',
      message: `the same route registration has two method/path pairs: ${material.registrationKey}`,
    });
    return;
  }
  collected.routes.set(material.registrationKey, {
    subject: material.subject,
    applicationId: material.applicationId,
    method: material.method,
    path: material.path,
  });
};

const addTestMaterial = (collected: TestCollection, material: Material): void => {
  if (material.kind === 'test') collected.tests.push(material.value);
  else if (material.kind === 'application') collected.applications.push(material.value);
  else if (material.kind === 'request') collected.requests.push(material.value);
  else if (material.kind === 'test-setup') addTestSetup(collected, material.value);
  else if (material.kind === 'route') addRoute(collected, material);
};

const collectTestMaterials = (sources: readonly TestMaterialSource[]): TestCollection => {
  const collected: TestCollection = {
    tests: [],
    setups: new Map(),
    applications: [],
    requests: [],
    routes: new Map(),
    failures: [],
  };
  for (const source of sources) {
    for (const material of source.materials) addTestMaterial(collected, material);
  }
  collected.tests.sort(
    (a, b) =>
      compare(a.location.filePath, b.location.filePath) || a.location.start - b.location.start,
  );
  return collected;
};

// ── Unit ──────────────────────────────────────────────────────────────────
const setupFor = (
  setups: ReadonlyMap<string, TestSetupContribution>,
  origin: ValueOrigin | null,
  ownerClass: ClassRef | null,
): UnitSetup | null | 'skip' => {
  if (origin === null) return null;
  if (origin.kind !== 'factory-result') return 'skip';
  const setup = setups.get(origin.factoryCall);
  if (setup === undefined) return 'skip';
  if (samePath(origin.path, setup.resultPath)) return toUnitSetup(setup);
  const accessed = accessorClassOf(origin.path);
  if (accessed !== null && sameClass(ownerClass, accessed)) return toUnitSetup(setup);
  return 'skip';
};

const unitCallsOf = (
  setups: ReadonlyMap<string, TestSetupContribution>,
  test: TestContribution,
): Map<string, UnitTestCase['calls'][number][]> => {
  const bySubject = new Map<string, UnitTestCase['calls'][number][]>();
  for (const call of test.calls) {
    const setup = setupFor(setups, call.origin, call.ownerClass);
    if (setup === 'skip') continue;
    const list = bySubject.get(call.subject) ?? [];
    list.push({ setup, invocation: locationOf(call.invocation) });
    bySubject.set(call.subject, list);
  }
  return bySubject;
};

const buildUnitCases = (collected: TestCollection): Map<string, UnitTestCase[]> => {
  const unitCases = new Map<string, UnitTestCase[]>();
  for (const test of collected.tests) {
    if (test.category !== 'unit') continue;
    for (const [subject, calls] of unitCallsOf(collected.setups, test)) {
      const list = unitCases.get(subject) ?? [];
      list.push({
        id: test.registration,
        name: test.name,
        suite: [...test.suite],
        location: locationOf(test.location),
        calls,
      });
      unitCases.set(subject, list);
    }
  }
  return unitCases;
};

// ── E2E ───────────────────────────────────────────────────────────────────
const applicationOf = (
  applications: readonly ApplicationContribution[],
  origin: ValueOrigin,
): string | null => {
  if (origin.kind !== 'factory-result') return null;
  for (const application of applications) {
    if (
      application.factoryCall === origin.factoryCall &&
      samePath(origin.path, application.resultPath)
    ) {
      return application.applicationId;
    }
  }
  return null;
};

const matchedRequests = (
  collected: TestCollection,
  route: RouteEntry,
  body: Span,
): RequestContribution[] =>
  collected.requests
    .filter(
      (request) =>
        withinSpan(body, request.invocation) &&
        request.method === route.method &&
        applicationOf(collected.applications, request.application) === route.applicationId &&
        pathMatches(route.path, request.path),
    )
    .sort((a, b) => a.invocation.start - b.invocation.start);

const addE2eCasesOfRoute = (
  collected: TestCollection,
  route: RouteEntry,
  e2eCases: Map<string, EndpointTests['cases'][number][]>,
): void => {
  for (const test of collected.tests) {
    const body = test.body;
    if (test.category !== 'e2e' || body === null) continue;
    const matched = matchedRequests(collected, route, body);
    if (matched.length === 0) continue;
    const list = e2eCases.get(route.subject) ?? [];
    list.push({
      id: test.registration,
      name: test.name,
      suite: [...test.suite],
      location: locationOf(test.location),
      requests: matched.map((request) => ({
        location: locationOf(request.invocation),
        via: request.via,
      })),
    });
    e2eCases.set(route.subject, list);
  }
};

const buildE2eCases = (
  collected: TestCollection,
): Map<string, EndpointTests['cases'][number][]> => {
  const e2eCases = new Map<string, EndpointTests['cases'][number][]>();
  for (const route of collected.routes.values()) addE2eCasesOfRoute(collected, route, e2eCases);
  return e2eCases;
};

/**
 * runner の test 材料・setup 材料・route 材料を突き合わせ、宣言ごとの Unit / E2E 一覧を作る(付録F・G)。
 * 照合できない由来は宣言へ書かず、取得状況(coverage)に残す。
 */
export const assembleTests = (sources: readonly TestMaterialSource[]): TestAssembly => {
  const collected = collectTestMaterials(sources);
  const reports = sources.flatMap((source) => [...source.reports]);

  const unitCases = buildUnitCases(collected);
  const unitCoverage = coverageOf(reports, 'unit', UNIT_FEATURES);
  const e2eCases = buildE2eCases(collected);
  const e2eCoverage = { ...coverageOf(reports, 'e2e', E2E_FEATURES), includesSharedSetup: false };
  const routeSubjects = new Set([...collected.routes.values()].map((route) => route.subject));

  return {
    unitTestsOf: (subject) =>
      unitCoverage.status === 'uncollected'
        ? NO_UNIT_TESTS
        : { cases: unitCases.get(subject) ?? [], coverage: unitCoverage },
    e2eTestsOf: (subject) =>
      routeSubjects.has(subject)
        ? { cases: e2eCases.get(subject) ?? [], coverage: e2eCoverage }
        : null,
    failures: collected.failures,
  };
};
