/* Relation semantics select a presentation; source identities and edges are never rewritten. */
function ecPresentationIndex(model) {
  const groups = new Map(model.groups.map((group) => [group.id, group]));
  const owners = new Map(model.declarations.map((node) => [node.id, node.group]));
  const owner = (id) => groups.get(owners.get(id) ?? id);
  const entries = new Set(
    model.roots
      .filter((root) => ['HTTP', 'Event', 'Middleware'].includes(root.kind))
      .map((root) => root.id),
  );
  return { owner, entries };
}

function ecPresentationRole(group) {
  if (group.file === 'integration/ec-backend/src/app.ts') return 'composition';
  if (group.column === 5) return 'config';
  return 'regular';
}

function ecPresentationKind(edge, index, showConfig) {
  const from = index.owner(edge.from),
    to = index.owner(edge.to);
  const roles = [from, to].map(ecPresentationRole);
  if (roles.includes('composition')) return 'composition';
  if (!showConfig && roles.includes('config')) return 'config';
  if (edge.kind === 'middleware') return 'middleware';
  if (ecPresentationWarp(edge, index)) return 'warp';
  return 'wires';
}

function ecPresentationWarp(edge, index) {
  if (edge.kind === 'event') return true;
  return (
    edge.kind === 'call' &&
    index.owner(edge.from).id !== index.owner(edge.to).id &&
    index.entries.has(edge.to)
  );
}

function ecPresentationPartition(model, edges, showConfig) {
  const index = ecPresentationIndex(model);
  const result = { wires: [], middleware: [], warp: [], config: [], composition: [] };
  for (const edge of edges) result[ecPresentationKind(edge, index, showConfig)].push(edge);
  return result;
}

function ecPresentationNotes(model, parts) {
  const { owner } = ecPresentationIndex(model);
  const notes = new Map(model.groups.map((group) => [group.id, new Map()]));
  const add = (id, kind, target, edge, incoming = false) => {
    const group = owner(id);
    const key = JSON.stringify([kind, target, incoming]);
    if (!notes.get(group.id).has(key))
      notes.get(group.id).set(key, { kind, target, incoming, originals: [] });
    notes.get(group.id).get(key).originals.push(edge);
  };
  for (const edge of parts.middleware) add(edge.from, 'middleware', edge.to, edge);
  for (const edge of parts.warp) {
    add(edge.from, edge.kind, edge.to, edge);
    add(edge.to, edge.kind, edge.from, edge, true);
  }
  for (const edge of parts.config) {
    for (const id of [edge.from, edge.to])
      if (ecPresentationRole(owner(id)) === 'regular') add(id, 'config', owner(id).id, edge);
  }
  return new Map([...notes].map(([id, values]) => [id, [...values.values()]]));
}

function ecPresentationSpace(model) {
  const notes = ecPresentationNotes(model, ecPresentationPartition(model, model.edges, false));
  return new Map(
    [...notes].map(([id, items]) => [id, items.length ? 22 + Math.ceil(items.length / 2) * 26 : 0]),
  );
}

window.EC_PRESENT = {
  role: ecPresentationRole,
  partition: ecPresentationPartition,
  notes: ecPresentationNotes,
  space: ecPresentationSpace,
};
