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

function ecDisplayGroups(model, options, units, active) {
  return new Map(
    model.groups.map((group) => {
      const sourceIds = [
        group.id,
        ...model.declarations.filter((n) => n.group === group.id).map((n) => n.id),
      ];
      const role = ecPresentationRole(group);
      return [
        group.id,
        {
          id: group.id,
          sourceIds,
          collapsed: options.collapsed.has(group.id),
          hidden: role === 'composition' || (role === 'config' && !options.showConfig),
          dimmed: active.size > 0 && !sourceIds.some((id) => active.has(id)),
          selected: units.get(options.selected) === group.id,
          changed: sourceIds.some((id) => options.changed.has(id)),
          notes: [],
        },
      ];
    }),
  );
}

function ecDisplayAttachments(model, parts, groups, units, active, scope) {
  const notes = ecPresentationNotes(model, parts);
  const { owner } = ecPresentationIndex(model);
  for (const [id, items] of notes) {
    const group = groups.get(id);
    group.notes = items.map((note) => ({
      ...note,
      key: JSON.stringify([id, note.kind, note.target, note.incoming]),
      units: [
        ...new Set(
          note.originals
            .flatMap((edge) => [edge.from, edge.to])
            .filter((source) => owner(source).id === id)
            .map((source) => units.get(source)),
        ),
      ],
      dimmed: group.collapsed
        ? group.dimmed
        : group.dimmed ||
          (active.size > 0 &&
            !note.originals.some((edge) =>
              note.kind === 'middleware' ? active.has(edge.from) : scope.has(edge),
            )),
    }));
  }
}

function ecDisplayGraph(model, options) {
  const units = window.EC_VIEW.units(model, options.collapsed);
  const active = new Set(options.edges.flatMap((edge) => [edge.from, edge.to]));
  if (options.focus) {
    active.add(options.focus);
    for (const node of model.declarations) if (node.group === options.focus) active.add(node.id);
  }
  const groups = ecDisplayGroups(model, options, units, active);
  const nodes = new Map(
    model.declarations.map((node) => [
      node.id,
      {
        id: node.id,
        unit: units.get(node.id),
        hidden: groups.get(node.group).hidden || groups.get(node.group).collapsed,
        dimmed: active.size > 0 && !active.has(node.id),
        selected: options.selected === node.id,
        changed: options.changed.has(node.id),
      },
    ]),
  );
  const allowed = (edge) => options.showTypes || edge.kind !== 'type';
  const edges = options.edges.filter(allowed);
  const parts = ecPresentationPartition(model, edges, options.showConfig);
  const allParts = ecPresentationPartition(model, model.edges.filter(allowed), options.showConfig);
  ecDisplayAttachments(model, allParts, groups, units, active, new Set(edges));
  return {
    units,
    active,
    groups,
    nodes,
    parts,
    total: edges.length,
    projection: window.EC_VIEW.project(model, options.collapsed, parts.wires, units),
  };
}

window.EC_PRESENT = {
  role: ecPresentationRole,
  partition: ecPresentationPartition,
  notes: ecPresentationNotes,
  space: ecPresentationSpace,
  display: ecDisplayGraph,
};
