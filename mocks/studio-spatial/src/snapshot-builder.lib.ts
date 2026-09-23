import type { Graph } from './graph.lib';
import { readGraph } from './graph.lib';
import type {
  EndpointTests,
  Hint,
  RelationKind,
  SourceDeclaration,
  SourceGroup,
  StudioSnapshot,
} from './snapshot.types';

const location = { filePath: 'src/sample.ts', startLine: 1, endLine: 1 };
const source = { location, signature: 'sample', excerpt: { kind: 'declaration-only' } } as const;

export function relation(from: string, to: string, kind: RelationKind = 'call') {
  return { id: `${from}->${to}:${kind}`, to, kind, evidence: [] };
}

interface DeclarationOptions {
  readonly name: string;
  readonly hints: readonly Hint[];
  readonly e2eTests: EndpointTests | null;
  readonly calls: readonly string[];
  readonly relations: SourceDeclaration['relations'];
}

export function declaration(
  id: string,
  overrides: Partial<DeclarationOptions> = {},
): SourceDeclaration {
  const options: DeclarationOptions = {
    name: id.split('.').at(-1) ?? id,
    hints: [],
    e2eTests: null,
    calls: [],
    relations: [],
    ...overrides,
  };
  return {
    id,
    name: options.name,
    kind: 'method',
    enclosingDeclarationId: null,
    relations: [...options.calls.map((to) => relation(id, to)), ...options.relations],
    source,
    unitTests: {
      cases: [],
      coverage: { status: 'uncollected', searchScope: [], inspectedFiles: [] },
    },
    e2eTests: options.e2eTests,
    unresolved: [],
    hints: [...options.hints],
  };
}

export function group(
  id: string,
  members: readonly SourceDeclaration[],
  options: {
    readonly column?: string;
    readonly name?: string;
    readonly filePath?: string;
    readonly startLine?: number;
  } = {},
): SourceGroup {
  const filePath = options.filePath ?? location.filePath,
    startLine = options.startLine ?? location.startLine;
  return {
    id,
    name: options.name ?? id,
    kind: 'class',
    filePath,
    members: [...members],
    relations: [],
    expansion: 'included',
    source: { ...source, location: { filePath, startLine, endLine: startLine } },
    unresolved: [],
    hints: [],
    presentation: { columnId: options.column ?? 'column:0', role: 'regular' },
  };
}

export function graphOf(groups: readonly SourceGroup[]): Graph {
  const snapshot: StudioSnapshot = {
    schemaVersion: 1,
    snapshotId: 'sample',
    project: { id: 'sample', name: 'sample' },
    provenance: 'manual-fixture',
    graph: {
      groups: [...groups],
      presentation: {
        id: 'sample',
        columns: [
          { id: 'column:0', label: 'Entry', width: 310 },
          { id: 'column:1', label: 'Use case', width: 310 },
        ],
      },
    },
  };
  return readGraph(snapshot);
}
