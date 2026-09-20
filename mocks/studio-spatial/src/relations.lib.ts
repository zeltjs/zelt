import type { Graph, Relation } from './graph.lib';
import { required } from './graph.lib';

export type RelationPart = 'wires' | 'middleware' | 'warp' | 'config' | 'composition';
export interface Attachment {
  readonly key: string;
  readonly groupId: string;
  readonly kind: 'middleware' | 'config' | 'event' | 'call';
  readonly target: string;
  readonly incoming: boolean;
  readonly relations: readonly Relation[];
}

export function relationPart(graph: Graph, edge: Relation, showConfig: boolean): RelationPart {
  const from = required(graph.owners, edge.from),
    to = required(graph.owners, edge.to);
  const roles = [from.presentation.role, to.presentation.role];
  if (roles.includes('composition')) return 'composition';
  if (!showConfig && roles.includes('config')) return 'config';
  if (edge.kind === 'middleware') return 'middleware';
  return isWarp(graph, edge) ? 'warp' : 'wires';
}

function isWarp(graph: Graph, edge: Relation): boolean {
  if (edge.kind === 'event') return true;
  if (edge.kind !== 'call') return false;
  const entry = graph.declarations.get(edge.to)?.entries.some((e) => e.kind !== 'lifecycle');
  return (
    required(graph.owners, edge.from).id !== required(graph.owners, edge.to).id && entry === true
  );
}

export function attachments(
  graph: Graph,
  showConfig: boolean,
  showTypes = true,
): readonly Attachment[] {
  const notes = new Map<string, Attachment>();
  const add = (
    id: string,
    kind: Attachment['kind'],
    target: string,
    relation: Relation,
    incoming = false,
  ) => {
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
    if (showTypes || edge.kind !== 'type') attachRelation(graph, edge, showConfig, add);
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
  showConfig: boolean,
  add: AddAttachment,
): void {
  const part = relationPart(graph, edge, showConfig);
  if (part === 'middleware') add(edge.from, 'middleware', edge.to, edge);
  if (part === 'warp') {
    const kind = edge.kind === 'event' ? 'event' : 'call';
    add(edge.from, kind, edge.to, edge);
    add(edge.to, kind, edge.from, edge, true);
  }
  if (part === 'config') {
    for (const id of [edge.from, edge.to]) {
      const owner = required(graph.owners, id);
      if (owner.presentation.role === 'regular') add(id, 'config', owner.id, edge);
    }
  }
}
