/* Trace each direction independently; folding and presentation never change source reachability. */
function ecTraceDirection(seeds, edges, from, to) {
  const nodes = new Set(seeds);
  const traversed = new Set();
  const queue = [...nodes];
  for (let i = 0; i < queue.length; i++) {
    for (const edge of edges) {
      if (edge[from] !== queue[i]) continue;
      traversed.add(edge);
      if (nodes.has(edge[to])) continue;
      nodes.add(edge[to]);
      queue.push(edge[to]);
    }
  }
  return { nodes, edges: traversed };
}

function ecTraceScope(seeds, edges) {
  const use = ecTraceDirection(seeds, edges, 'from', 'to');
  const usedBy = ecTraceDirection(seeds, edges, 'to', 'from');
  return {
    use,
    usedBy,
    nodes: new Set([...use.nodes, ...usedBy.nodes]),
    edges: edges.filter((edge) => use.edges.has(edge) || usedBy.edges.has(edge)),
  };
}

window.EC_SCOPE = { trace: ecTraceScope };
