import type { ClassView, ViewMethod, ViewNode } from './graph-view.lib';

export const formatMethodSignature = (sig: ViewMethod): string =>
  `${sig.name}(${sig.params.map((p) => `${p.name}: ${p.type}`).join(', ')}): ${sig.returnType}`;

export const findGraphNode = (view: ClassView, id: string): ViewNode | undefined =>
  view.nodes.find((node) => node.id === id);
