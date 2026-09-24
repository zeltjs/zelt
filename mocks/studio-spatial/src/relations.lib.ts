import type { Graph, Relation } from './graph.lib';
import { required } from './graph.lib';
import { grantedKind, relationKind } from './labels';

export type RelationPart = 'wires' | 'middleware' | 'warp' | 'hidden';
export interface Attachment {
  readonly key: string;
  readonly groupId: string;
  readonly kind: 'middleware' | 'event';
  readonly target: string;
  readonly incoming: boolean;
  readonly relations: readonly Relation[];
}

function columnOf(graph: Graph, id: string): string {
  return required(graph.owners, id).presentation.columnId;
}

export function relationPart(
  graph: Graph,
  edge: Relation,
  hiddenColumns: readonly string[],
): RelationPart {
  // Hiding a column takes its relations off the map entirely, chips included.
  const ends = [columnOf(graph, edge.from), columnOf(graph, edge.to)];
  if (ends.some((c) => hiddenColumns.includes(c))) return 'hidden';
  const granted = grantedKind(edge);
  if (granted === 'middleware') return 'middleware';
  if (granted === 'event') return 'warp';
  return 'wires';
}

export function attachments(
  graph: Graph,
  hiddenColumns: readonly string[],
  showTypes = true,
): readonly Attachment[] {
  const notes = new Map<string, Attachment>();
  const add: AddAttachment = (id, kind, target, relation, incoming = false) => {
    const groupId = required(graph.owners, id).id;
    const key = JSON.stringify([groupId, kind, target, incoming]);
    const previous = notes.get(key);
    notes.set(key, {
      key,
      groupId,
      kind,
      target,
      incoming,
      relations: [...(previous?.relations ?? []), relation],
    });
  };
  for (const edge of graph.relations) {
    if (showTypes || relationKind(edge) !== 'type') attachRelation(graph, edge, hiddenColumns, add);
  }
  return [...notes.values()];
}

type AddAttachment = (
  id: string,
  kind: Attachment['kind'],
  target: string,
  edge: Relation,
  incoming?: boolean,
) => void;
function attachRelation(
  graph: Graph,
  edge: Relation,
  hiddenColumns: readonly string[],
  add: AddAttachment,
): void {
  const part = relationPart(graph, edge, hiddenColumns);
  if (part === 'middleware') add(edge.from, 'middleware', edge.to, edge);
  if (part === 'warp') {
    add(edge.from, 'event', edge.to, edge);
    add(edge.to, 'event', edge.from, edge, true);
  }
}
