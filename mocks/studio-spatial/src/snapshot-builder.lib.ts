import type { Graph } from './graph.lib';
import { readGraph } from './graph.lib';
import type {
  EndpointTests,
  GrantedRelation,
  Hint,
  Meaning,
  SetupItem,
  SourceDeclaration,
  SourceGroup,
  StudioSnapshot,
  TsRelation,
  TsRelationKind,
  UnitTests,
} from './snapshot.types';

const location = { filePath: 'src/sample.ts', startLine: 1, endLine: 1 };
const source = { location, signature: 'sample', excerpt: { kind: 'declaration-only' } } as const;

export function relation(
  from: string,
  to: string,
  kind: TsRelationKind = 'call',
  meanings: readonly Meaning[] = [],
): TsRelation {
  return {
    id: `${from}->${to}:${kind}`,
    origin: 'ts',
    to,
    kind,
    meanings: [...meanings],
    evidence: [],
  };
}

export function granted(
  from: string,
  to: string,
  kind: string,
  provider = 'zelt',
  order: number | null = null,
): GrantedRelation {
  return {
    id: `${from}->${to}:${provider}:${kind}`,
    origin: 'plugin',
    to,
    provider,
    kind,
    order,
    evidence: [],
  };
}

interface DeclarationOptions {
  readonly name: string;
  readonly hints: readonly Hint[];
  readonly e2eTests: EndpointTests | null;
  readonly unitTests: UnitTests;
  readonly calls: readonly string[];
  readonly relations: SourceDeclaration['relations'];
  readonly setup: readonly SetupItem[];
  readonly meanings: readonly Meaning[];
  readonly startLine: number;
}

export function declaration(
  id: string,
  overrides: Partial<DeclarationOptions> = {},
): SourceDeclaration {
  const options: DeclarationOptions = {
    name: id.split('.').at(-1) ?? id,
    hints: [],
    e2eTests: null,
    unitTests: {
      cases: [],
      coverage: { status: 'uncollected', searchScope: [], inspectedFiles: [] },
    },
    calls: [],
    relations: [],
    setup: [],
    meanings: [],
    startLine: location.startLine,
    ...overrides,
  };
  return {
    id,
    name: options.name,
    kind: 'method',
    meanings: [...options.meanings],
    enclosingDeclarationId: null,
    relations: [...options.calls.map((to) => relation(id, to)), ...options.relations],
    setup: [...options.setup],
    source: {
      ...source,
      location: { ...location, startLine: options.startLine, endLine: options.startLine },
    },
    unitTests: options.unitTests,
    e2eTests: options.e2eTests,
    unresolved: [],
    hints: [...options.hints],
  };
}

interface GroupOptions {
  readonly column: string;
  readonly name: string;
  readonly filePath: string;
  readonly startLine: number;
  readonly relations: SourceGroup['relations'];
  readonly setup: readonly SetupItem[];
}

export function group(
  id: string,
  members: readonly SourceDeclaration[],
  overrides: Partial<GroupOptions> = {},
): SourceGroup {
  const options: GroupOptions = {
    column: 'column:0',
    name: id,
    filePath: location.filePath,
    startLine: location.startLine,
    relations: [],
    setup: [],
    ...overrides,
  };
  const { filePath, startLine } = options;
  return {
    id,
    name: options.name,
    kind: 'class',
    filePath,
    members: [...members],
    relations: [...options.relations],
    setup: [...options.setup],
    expansion: 'included',
    source: { ...source, location: { filePath, startLine, endLine: startLine } },
    unresolved: [],
    hints: [],
    presentation: { columnId: options.column },
  };
}

export interface ColumnOptions {
  readonly id: string;
  readonly label: string;
  readonly initiallyHidden?: boolean;
}
const defaultColumns: readonly ColumnOptions[] = [
  { id: 'column:0', label: 'Entry' },
  { id: 'column:1', label: 'Use case' },
];

export function graphOf(
  groups: readonly SourceGroup[],
  columns: readonly ColumnOptions[] = defaultColumns,
): Graph {
  const snapshot: StudioSnapshot = {
    schemaVersion: 1,
    snapshotId: 'sample',
    project: { id: 'sample', name: 'sample' },
    provenance: 'manual-fixture',
    graph: {
      groups: [...groups],
      presentation: {
        id: 'sample',
        columns: columns.map((c) => ({
          id: c.id,
          label: c.label,
          width: 310,
          initiallyHidden: c.initiallyHidden ?? false,
        })),
      },
    },
  };
  return readGraph(snapshot);
}
