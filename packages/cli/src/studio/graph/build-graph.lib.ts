import type { ClassSource } from '@zeltjs/decorator-metadata/inspect';

import type {
  AppliedMiddleware,
  ContractResolver,
  DependencyGraph,
  DependencyResolution,
  DependencyResolver,
  GraphEdge,
  GraphEdgeKind,
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
  readonly resolveContract?: ContractResolver;
};

type QueueItem = { readonly id: string; readonly source: ClassSource };

type GraphState = {
  readonly nodes: Map<string, GraphNode>;
  readonly edgeKeys: Set<string>;
  readonly edges: GraphEdge[];
  readonly queue: QueueItem[];
  readonly formatPath: (filePath: string) => string;
  readonly resolveContract: ContractResolver | undefined;
};

const idOfSource = (state: GraphState, source: ClassSource): string =>
  nodeId(state.formatPath(source.filePath), source.exportName);

// ClassSource へ変換できないルートは依存解決の起点を持てないため即 unresolved 扱いにする。
// featureKey を判別子に含めないと、同名 className の別ルートが同一 id に潰れて 2 つ目以降が消える
const seedUnresolvedRoot = (state: GraphState, root: GraphRoot): string => {
  const id = nodeId(`${UNKNOWN_FILE}:${root.featureKey}`, root.className);
  if (state.nodes.has(id)) return id;
  state.nodes.set(id, {
    id,
    className: root.className,
    filePath: UNKNOWN_FILE,
    kind: root.kind,
    featureKey: root.featureKey,
    decorators: root.decorators,
    unresolved: true,
  });
  return id;
};

// seedRoot: id を返すよう変更し、decorators / routes を載せる。
// 依存として先に発見済みの合流ケースにも root 由来の属性を付け直す
const seedRoot = (state: GraphState, root: GraphRoot): string => {
  if (root.source === undefined) return seedUnresolvedRoot(state, root);
  const id = idOfSource(state, root.source);
  const rootAttrs = {
    featureKey: root.featureKey,
    decorators: root.decorators,
    ...(root.routes !== undefined ? { routes: root.routes } : {}),
  };
  const existing = state.nodes.get(id);
  if (existing) {
    state.nodes.set(id, { ...existing, ...rootAttrs });
    return id;
  }
  state.nodes.set(id, {
    id,
    className: root.className,
    filePath: state.formatPath(root.source.filePath),
    kind: root.kind,
    ...rootAttrs,
  });
  state.queue.push({ id, source: root.source });
  return id;
};

// addEdge: kind をキーに含め、同一ペアの別種エッジを共存させる
const addEdge = (
  state: GraphState,
  from: string,
  to: string,
  kind: GraphEdgeKind,
  methods?: readonly string[],
): void => {
  const edgeKey = `${from}->${to}#${kind}`;
  if (state.edgeKeys.has(edgeKey)) return;
  state.edgeKeys.add(edgeKey);
  state.edges.push({ from, to, kind, ...(methods !== undefined ? { methods } : {}) });
};

// 新規: @UseMiddleware 由来のノード/エッジ。middleware 自身の依存も展開するため queue に積む
const seedAppliedMiddleware = (state: GraphState, fromId: string, mw: AppliedMiddleware): void => {
  const mwId = mw.source ? idOfSource(state, mw.source) : nodeId(UNKNOWN_FILE, mw.className);
  if (!state.nodes.has(mwId)) {
    state.nodes.set(mwId, {
      id: mwId,
      className: mw.className,
      filePath: mw.source ? state.formatPath(mw.source.filePath) : UNKNOWN_FILE,
      kind: decoratorsToKind(mw.decorators),
      decorators: mw.decorators,
      ...(mw.source === undefined ? { unresolved: true as const } : {}),
    });
    if (mw.source) state.queue.push({ id: mwId, source: mw.source });
  }
  addEdge(state, fromId, mwId, 'applies-middleware', mw.methods);
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
      decorators: dep.decorators,
    });
    state.queue.push({ id: depId, source: dep.source });
  }
  addEdge(state, item.id, depId, 'injects');
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
  addEdge(state, item.id, depId, 'injects');
};

// resolveContract 指定時のみ、resolved ノードに契約を付与する（副作用境界の呼び出しをここに閉じ込める）
const attachContract = async (state: GraphState, item: QueueItem): Promise<void> => {
  if (!state.resolveContract) return;
  const node = state.nodes.get(item.id);
  if (!node) return;
  state.nodes.set(item.id, { ...node, contract: await state.resolveContract(item.source) });
};

const visitDependencies = (
  state: GraphState,
  item: QueueItem,
  deps: readonly DependencyResolution[],
): void => {
  for (const dep of deps) {
    if (dep.kind === 'class') {
      visitClassDependency(state, item, dep);
    } else {
      visitUnresolvedDependency(state, item, dep);
    }
  }
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
  await attachContract(state, item);
  visitDependencies(state, item, result.deps);
};

// root の queue 投入とその appliedMiddlewares の seed をまとめる
const seedRootsAndMiddlewares = (state: GraphState, roots: readonly GraphRoot[]): void => {
  for (const root of roots) {
    const id = seedRoot(state, root);
    for (const mw of root.appliedMiddlewares ?? []) seedAppliedMiddleware(state, id, mw);
  }
};

const drainQueue = async (
  state: GraphState,
  resolveDependencies: DependencyResolver,
): Promise<void> => {
  for (let item = state.queue.shift(); item !== undefined; item = state.queue.shift()) {
    await visitQueueItem(state, item, resolveDependencies);
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
    resolveContract: options?.resolveContract,
  };

  seedRootsAndMiddlewares(state, roots);
  await drainQueue(state, resolveDependencies);

  return { version: 2, nodes: [...state.nodes.values()], edges: state.edges };
};
