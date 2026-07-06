import type {
  DependencyGraph,
  DependencyResolver,
  GraphEdge,
  GraphNode,
  GraphNodeKind,
  GraphRoot,
  ResolvedDependency,
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

type QueueItem = { readonly id: string; readonly filePath: string; readonly className: string };

type GraphState = {
  readonly nodes: Map<string, GraphNode>;
  readonly edgeKeys: Set<string>;
  readonly edges: GraphEdge[];
  readonly queue: QueueItem[];
};

// filePath 不明なルートは AST 解析の起点を持てないため即 unresolved 扱いにする
const seedUnresolvedRoot = (state: GraphState, root: GraphRoot): void => {
  const id = nodeId(UNKNOWN_FILE, root.className);
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
  if (root.filePath === undefined) {
    seedUnresolvedRoot(state, root);
    return;
  }
  const id = nodeId(root.filePath, root.className);
  if (state.nodes.has(id)) return;
  state.nodes.set(id, {
    id,
    className: root.className,
    filePath: root.filePath,
    kind: root.kind,
    featureKey: root.featureKey,
  });
  state.queue.push({ id, filePath: root.filePath, className: root.className });
};

const addEdge = (state: GraphState, from: string, to: string): void => {
  const edgeKey = `${from}->${to}`;
  if (state.edgeKeys.has(edgeKey)) return;
  state.edgeKeys.add(edgeKey);
  state.edges.push({ from, to });
};

const visitDependency = (state: GraphState, item: QueueItem, dep: ResolvedDependency): void => {
  const depId = nodeId(dep.filePath, dep.className);
  if (!state.nodes.has(depId)) {
    state.nodes.set(depId, {
      id: depId,
      className: dep.className,
      filePath: dep.filePath,
      kind: decoratorsToKind(dep.decorators),
    });
    state.queue.push({ id: depId, filePath: dep.filePath, className: dep.className });
  }
  addEdge(state, item.id, depId);
};

const visitQueueItem = async (
  state: GraphState,
  item: QueueItem,
  resolveDependencies: DependencyResolver,
): Promise<void> => {
  const result = await resolveDependencies(item.filePath, item.className);
  if (result.kind === 'unresolved') {
    const node = state.nodes.get(item.id);
    if (node) state.nodes.set(item.id, { ...node, unresolved: true });
    return;
  }
  for (const dep of result.deps) {
    visitDependency(state, item, dep);
  }
};

export const buildDependencyGraph = async (
  roots: readonly GraphRoot[],
  resolveDependencies: DependencyResolver,
): Promise<DependencyGraph> => {
  const state: GraphState = {
    nodes: new Map(),
    edgeKeys: new Set(),
    edges: [],
    queue: [],
  };

  for (const root of roots) {
    seedRoot(state, root);
  }

  for (let item = state.queue.shift(); item !== undefined; item = state.queue.shift()) {
    await visitQueueItem(state, item, resolveDependencies);
  }

  return { version: 1, nodes: [...state.nodes.values()], edges: state.edges };
};
