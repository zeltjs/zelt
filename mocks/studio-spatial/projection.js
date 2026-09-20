/* Display projection only: the source graph and dependency traversal stay unchanged. */
function ecViewLayout(model, collapsed, extra = new Map()) {
  const boxes = new Map();
  for (let column = 0; column < model.columns.length; column++) {
    let removed = 0;
    const groups = model.groups.filter((g) => g.column === column).sort((a, b) => a.y - b.y);
    for (const group of groups) {
      const members = model.declarations.filter((n) => n.group === group.id);
      const fullHeight = 62 + members.length * 46;
      const height = (collapsed.has(group.id) ? 62 : fullHeight) + (extra.get(group.id) ?? 0);
      boxes.set(group.id, { x: column * 310 + 14, y: group.y - removed, width: 282, height });
      removed += fullHeight - height;
    }
  }
  return { boxes, height: ecViewHeight(model, boxes, collapsed.size + extra.size) };
}

function ecViewHeight(model, boxes, changed) {
  return changed
    ? Math.max(...[...boxes.values()].map((box) => box.y + box.height)) + 82
    : model.height;
}

function ecViewUnits(model, collapsed) {
  return new Map([
    ...model.groups.map((group) => [group.id, group.id]),
    ...model.declarations.map((node) => [
      node.id,
      collapsed.has(node.group) ? node.group : node.id,
    ]),
  ]);
}

function ecViewProject(model, collapsed, edges, units = ecViewUnits(model, collapsed)) {
  const bundles = new Map();
  const internal = new Map();
  for (const edge of edges) {
    const from = units.get(edge.from),
      to = units.get(edge.to);
    if (from === to && collapsed.has(from)) {
      internal.set(from, (internal.get(from) ?? 0) + 1);
      continue;
    }
    const key = JSON.stringify([from, to, edge.kind]);
    if (!bundles.has(key)) bundles.set(key, { from, to, kind: edge.kind, originals: [] });
    bundles.get(key).originals.push(edge);
  }
  return { edges: ecSeparateParallel([...bundles.values()]), internal };
}

function ecSeparateParallel(projected) {
  const pairs = new Map();
  for (const edge of projected) {
    const key = JSON.stringify([edge.from, edge.to].sort());
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(edge);
  }
  for (const edges of pairs.values()) {
    const step = Math.min(10, 28 / edges.length);
    edges.forEach((edge, index) => {
      edge.offset = (index - (edges.length - 1) / 2) * step;
    });
  }
  return projected;
}

window.EC_VIEW = { layout: ecViewLayout, project: ecViewProject, units: ecViewUnits };
