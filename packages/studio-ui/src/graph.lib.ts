import type {
  SourceDeclaration,
  SourceGroup,
  SourceRelation,
  StudioSnapshot,
} from '@zeltjs/studio-extract/snapshot';
import { StudioSnapshotSchema } from '@zeltjs/studio-extract/snapshot';
import { parse } from 'valibot';

export type Relation = SourceRelation & { readonly from: string };
export interface Graph {
  readonly snapshot: StudioSnapshot;
  readonly groups: ReadonlyMap<string, SourceGroup>;
  readonly declarations: ReadonlyMap<string, SourceDeclaration>;
  readonly owners: ReadonlyMap<string, SourceGroup>;
  readonly relations: readonly Relation[];
}

/** @throws {Error} */
export function required<T>(map: ReadonlyMap<string, T>, id: string): T {
  const value = map.get(id);
  if (value === undefined) throw new Error(`Unknown identity: ${id}`);
  return value;
}

/** @throws {Error} */
function unique<T>(items: readonly T[], identify: (item: T) => string): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const id = identify(item);
    if (result.has(id)) throw new Error(`Duplicate identity: ${id}`);
    result.set(id, item);
  }
  return result;
}

/** @throws {Error} */
export function readGraph(input: unknown): Graph {
  const snapshot = parse(StudioSnapshotSchema, input);
  const source = snapshot.graph;
  const groups = unique(source.groups, (g) => g.id);
  const declarations = unique(
    source.groups.flatMap((g) => g.members),
    (d) => d.id,
  );
  const owners = unique(
    source.groups.flatMap((g) =>
      [g.id, ...g.members.map((d) => d.id)].map((id) => ({ id, group: g })),
    ),
    (x) => x.id,
  );
  const relations = [...groups.values(), ...declarations.values()].flatMap((s) =>
    s.relations.map((relation) => ({ ...relation, from: s.id })),
  );
  unique(relations, (r) => r.id);
  const graph = {
    snapshot,
    groups,
    declarations,
    relations,
    owners: new Map([...owners].map(([id, value]) => [id, value.group])),
  };
  validateReferences(graph);
  return graph;
}

/** @throws {Error} */
function validateReferences(graph: Graph): void {
  const columns = unique(graph.snapshot.graph.presentation.columns, (c) => c.id);
  for (const group of graph.groups.values()) required(columns, group.presentation.columnId);
  for (const relation of graph.relations) required(graph.owners, relation.to);
  validateSetup(graph);
  for (const declaration of graph.declarations.values()) {
    if (declaration.enclosingDeclarationId !== null)
      required(graph.declarations, declaration.enclosingDeclarationId);
  }
}

/** @throws {Error} */
function validateSetup(graph: Graph): void {
  const items = [...graph.groups.values(), ...graph.declarations.values()].flatMap((s) => s.setup);
  for (const item of items) if (item.target !== null) required(graph.owners, item.target);
}

/** @throws {Error} */
export function subject(graph: Graph, id: string): SourceGroup | SourceDeclaration {
  return graph.declarations.get(id) ?? required(graph.groups, id);
}

export function seeds(graph: Graph, id: string): readonly string[] {
  const group = graph.groups.get(id);
  return group ? [id, ...group.members.map((m) => m.id)] : [id];
}
