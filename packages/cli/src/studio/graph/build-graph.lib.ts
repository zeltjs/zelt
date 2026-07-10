import type { ClassSource } from '@zeltjs/decorator-metadata/inspect';

import type {
  DependencyGraph,
  DependencyResolution,
  DependencyResolver,
  GraphEdge,
  GraphNode,
  GraphNodeKind,
  GraphRoot,
} from './graph.types';

const DECORATOR_KIND_MAP: ReadonlyMap<string, GraphNodeKind> = new Map([
  ['Controller', 'controller'],
  ['Command', 'command'],
  ['Config', 'config'],
  ['Middleware', 'middleware'],
  ['ErrorHandler', 'error-handler'],
]);

export const nodeId = (filePath: string, className: string): string => `${filePath}#${className}`;

export const decoratorsToKind = (decorators: readonly string[]): GraphNodeKind => {
  for (const name of decorators) {
    const kind = DECORATOR_KIND_MAP.get(name);
    if (kind !== undefined) return kind;
  }
  return 'service';
};

const UNKNOWN_FILE = '(unknown)';

export type BuildGraphOptions = {
  // 表示用パスへの変換（例: cwd からの相対化）。ID にも同じ変換を使い、表示と ID の対応を保つ
  readonly formatPath?: (filePath: string) => string;
};

type QueueItem = { readonly id: string; readonly source: ClassSource };

type GraphState = {
  readonly nodes: Map<string, GraphNode>;
  readonly edgeKeys: Set<string>;
  readonly edges: GraphEdge[];
  readonly queue: QueueItem[];
  readonly formatPath: (filePath: string) => string;
};

const idOfSource = (state: GraphState, source: ClassSource): string =>
  nodeId(state.formatPath(source.filePath), source.exportName);

// ClassSource へ変換できないルートは依存解決の起点を持てないため即 unresolved 扱いにする。
// featureKey を判別子に含めないと、同名 className の別ルートが同一 id に潰れて 2 つ目以降が消える
const seedUnresolvedRoot = (state: GraphState, root: GraphRoot): void => {
  const id = nodeId(`${UNKNOWN_FILE}:${root.featureKey}`, root.className);
  if (state.nodes.has(id)) return;
  state.nodes.set(id, {
    id,
    className: root.className,
    filePath: UNKNOWN_FILE,
    kind: root.kind,
    featureKey: root.featureKey,
    unresolved: true,
  });
};

const seedRoot = (state: GraphState, root: GraphRoot): void => {
  if (root.source === undefined) {
    seedUnresolvedRoot(state, root);
    return;
  }
  const id = idOfSource(state, root.source);
  const existing = state.nodes.get(id);
  if (existing) {
    // 依存として先に発見されたクラスが root でもある場合、featureKey を付け直して合流する
    state.nodes.set(id, { ...existing, featureKey: root.featureKey });
    return;
  }
  state.nodes.set(id, {
    id,
    className: root.className,
    filePath: state.formatPath(root.source.filePath),
    kind: root.kind,
    featureKey: root.featureKey,
  });
  state.queue.push({ id, source: root.source });
};

const addEdge = (state: GraphState, from: string, to: string): void => {
  const edgeKey = `${from}->${to}`;
  if (state.edgeKeys.has(edgeKey)) return;
  state.edgeKeys.add(edgeKey);
  state.edges.push({ from, to });
};

const visitClassDependency = (
  state: GraphState,
  item: QueueItem,
  dep: Extract<DependencyResolution, { kind: 'class' }>,
): void => {
  const depId = idOfSource(state, dep.source);
  if (!state.nodes.has(depId)) {
    state.nodes.set(depId, {
      id: depId,
      className: dep.source.exportName,
      filePath: state.formatPath(dep.source.filePath),
      kind: decoratorsToKind(dep.decorators),
    });
    state.queue.push({ id: depId, source: dep.source });
  }
  addEdge(state, item.id, depId);
};

const visitUnresolvedDependency = (
  state: GraphState,
  item: QueueItem,
  dep: Extract<DependencyResolution, { kind: 'unresolved' }>,
): void => {
  const depId = nodeId(UNKNOWN_FILE, dep.localName);
  if (!state.nodes.has(depId)) {
    state.nodes.set(depId, {
      id: depId,
      className: dep.localName,
      filePath: UNKNOWN_FILE,
      kind: 'service',
      unresolved: true,
    });
  }
  addEdge(state, item.id, depId);
};

const visitQueueItem = async (
  state: GraphState,
  item: QueueItem,
  resolveDependencies: DependencyResolver,
): Promise<void> => {
  const result = await resolveDependencies(item.source);
  if (result.kind === 'external') return;
  if (result.kind === 'unresolved') {
    const node = state.nodes.get(item.id);
    if (node) state.nodes.set(item.id, { ...node, unresolved: true });
    return;
  }
  for (const dep of result.deps) {
    if (dep.kind === 'class') {
      visitClassDependency(state, item, dep);
    } else {
      visitUnresolvedDependency(state, item, dep);
    }
  }
};

export const buildDependencyGraph = async (
  roots: readonly GraphRoot[],
  resolveDependencies: DependencyResolver,
  options?: BuildGraphOptions,
): Promise<DependencyGraph> => {
  const state: GraphState = {
    nodes: new Map(),
    edgeKeys: new Set(),
    edges: [],
    queue: [],
    formatPath: options?.formatPath ?? ((filePath) => filePath),
  };

  for (const root of roots) {
    seedRoot(state, root);
  }

  for (let item = state.queue.shift(); item !== undefined; item = state.queue.shift()) {
    await visitQueueItem(state, item, resolveDependencies);
  }

  return { version: 1, nodes: [...state.nodes.values()], edges: state.edges };
};
