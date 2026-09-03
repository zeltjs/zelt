import type { DependencyGraph } from '../../src/studio/graph/graph.types';

// 部分文字列一致だと "node_modules_like" 等を誤検知するため、
// パスをセグメントに分けて "node_modules" 完全一致で判定する
// （先頭・途中・"../" 経由・pnpm 仮想 store のネストしたパスも同じ判定で拾える）
export const isNodeModulesPath = (filePath: string): boolean =>
  filePath.split('/').includes('node_modules');

export const hideNodeModules = (graph: DependencyGraph): DependencyGraph => {
  const hiddenIds = new Set(
    graph.nodes.filter((node) => isNodeModulesPath(node.filePath)).map((node) => node.id),
  );
  return {
    version: graph.version,
    nodes: graph.nodes.filter((node) => !hiddenIds.has(node.id)),
    edges: graph.edges.filter((edge) => !hiddenIds.has(edge.from) && !hiddenIds.has(edge.to)),
  };
};
