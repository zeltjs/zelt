/* Display projection only: the source graph and dependency traversal stay unchanged. */
function ecViewLayout(model, collapsed) {
  const boxes = new Map();
  for (let column = 0; column < model.columns.length; column++) {
    let removed = 0;
    const groups = model.groups.filter((g) => g.column === column).sort((a, b) => a.y - b.y);
    for (const group of groups) {
      const members = model.declarations.filter((n) => n.group === group.id);
      const fullHeight = 62 + members.length * 46;
      const height = collapsed.has(group.id) ? 86 : fullHeight;
      boxes.set(group.id, { x: column * 310 + 14, y: group.y - removed, width: 282, height });
      removed += fullHeight - height;
    }
  }
  const height = collapsed.size
    ? Math.max(...[...boxes.values()].map((box) => box.y + box.height)) + 82
    : model.height;
  return { boxes, height };
}

function ecViewProject(model, collapsed, edges) {
  const owners = new Map(model.declarations.map((n) => [n.id, n.group]));
  const endpoint = (id) => (collapsed.has(owners.get(id)) ? owners.get(id) : id);
  const bundles = new Map();
  const internal = new Map();
  for (const edge of edges) {
    const from = endpoint(edge.from),
      to = endpoint(edge.to);
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

window.EC_VIEW = { layout: ecViewLayout, project: ecViewProject };
