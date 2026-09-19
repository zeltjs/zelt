import type { ClassView } from './graph-view.lib';

// external な依存(v2 の node_modules 相当)は "ext:" で始まるグループにまとまる
// (collapse.lib.dirOf 参照)ため、デフォルト折りたたみ対象の判定にも流用できる
export const isExternalDir = (dir: string): boolean => dir.startsWith('ext:');

export const hideNodeModules = (view: ClassView): ClassView => {
  const hiddenIds = new Set(view.nodes.filter((node) => node.external).map((node) => node.id));
  return {
    nodes: view.nodes.filter((node) => !hiddenIds.has(node.id)),
    edges: view.edges.filter((edge) => !hiddenIds.has(edge.from) && !hiddenIds.has(edge.to)),
  };
};
