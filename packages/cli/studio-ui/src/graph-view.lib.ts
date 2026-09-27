import { match, P } from 'ts-pattern';

import type {
  AppliesMiddlewareEdge,
  ClassNode,
  DependencyGraph,
  ExternalNode,
  FnNode,
  InjectsEdge,
} from '../../src/studio/graph/graph.types';

export type ViewRoute = {
  readonly method: string;
  readonly path: string;
  readonly handler: string;
};

export type ViewMethod = {
  readonly name: string;
  readonly params: readonly { readonly name: string; readonly type: string }[];
  readonly returnType: string;
};

export type ViewNode = {
  readonly id: string;
  readonly name: string;
  readonly filePath: string;
  readonly fileKind: string | null;
  readonly external: boolean;
  readonly decorators: readonly string[];
  readonly routes: readonly ViewRoute[];
  readonly methods: readonly ViewMethod[];
};

export type ViewEdge = {
  readonly from: string;
  readonly to: string;
  readonly kind: 'injects' | 'applies-middleware';
  readonly methods?: readonly string[];
};

export type ClassView = {
  readonly nodes: readonly ViewNode[];
  readonly edges: readonly ViewEdge[];
};

// v3 の GraphNodeV3 は kind/external の有無で判別できる判別共用体だが、自作 type predicate と
// in 演算子は禁止(repo の eslint 規約)のため、build-graph.lib.ts と同じく ts-pattern の
// match で構造判定する
const classNodesOf = (graph: DependencyGraph): readonly ClassNode[] =>
  graph.nodes.flatMap((node) =>
    match(node)
      .with({ kind: 'class' }, (cls) => [cls])
      .otherwise(() => []),
  );

const externalNodesOf = (graph: DependencyGraph): readonly ExternalNode[] =>
  graph.nodes.flatMap((node) =>
    match(node)
      .with({ external: true }, (ext) => [ext])
      .otherwise(() => []),
  );

// FnNode だけが contract を持つため、これで FnNode を判別する
const fnNodesOf = (graph: DependencyGraph): readonly FnNode[] =>
  graph.nodes.flatMap((node) =>
    match(node)
      .with({ contract: P.any }, (fn) => [fn])
      .otherwise(() => []),
  );

// ClassNode 直下のメンバー FnNode(同一 filePath かつ owner が一致するもの)
const methodsOfClass = (cls: ClassNode, fnNodes: readonly FnNode[]): readonly FnNode[] =>
  fnNodes.filter((fn) => fn.filePath === cls.filePath && fn.owner === cls.name);

const routesOfMethods = (methods: readonly FnNode[]): readonly ViewRoute[] =>
  methods.flatMap((fn) =>
    fn.entry !== undefined && fn.entry.kind === 'http'
      ? [{ method: fn.entry.method, path: fn.entry.path, handler: fn.name }]
      : [],
  );

const publicSignaturesOf = (methods: readonly FnNode[]): readonly ViewMethod[] =>
  methods
    .filter((fn) => fn.visibility === 'public')
    .map((fn) => ({
      name: fn.name,
      params: fn.contract.params,
      returnType: fn.contract.returnType,
    }));

const classViewNodeOf = (cls: ClassNode, fnNodes: readonly FnNode[]): ViewNode => {
  const methods = methodsOfClass(cls, fnNodes);
  return {
    id: cls.id,
    name: cls.name,
    filePath: cls.filePath,
    fileKind: cls.fileKind,
    external: false,
    decorators: cls.decorators,
    routes: routesOfMethods(methods),
    methods: publicSignaturesOf(methods),
  };
};

const externalViewNodeOf = (node: ExternalNode): ViewNode => ({
  id: node.id,
  name: node.member,
  filePath: `ext:${node.package}`,
  fileKind: null,
  external: true,
  decorators: [],
  routes: [],
  methods: [],
});

const viewEdgeOf = (edge: InjectsEdge | AppliesMiddlewareEdge): ViewEdge =>
  edge.kind === 'applies-middleware' && edge.methods !== undefined
    ? { from: edge.from, to: edge.to, kind: edge.kind, methods: edge.methods }
    : { from: edge.from, to: edge.to, kind: edge.kind };

// calls / event エッジは UI の対象外(第2サブプロジェクトの範囲)のため捨てる
const viewEdgesOf = (graph: DependencyGraph): readonly ViewEdge[] =>
  graph.edges.flatMap((edge) =>
    edge.kind === 'injects' || edge.kind === 'applies-middleware' ? [viewEdgeOf(edge)] : [],
  );

// UI が扱う view model への唯一の変換入口。owner を持たない FnNode(モジュール関数)や
// owner に対応する ClassNode が無い FnNode は、表示対象のクラス単位に集約できないため含めない
export const toClassView = (graph: DependencyGraph): ClassView => {
  const fnNodes = fnNodesOf(graph);
  const nodes: readonly ViewNode[] = [
    ...classNodesOf(graph).map((cls) => classViewNodeOf(cls, fnNodes)),
    ...externalNodesOf(graph).map(externalViewNodeOf),
  ];
  return { nodes, edges: viewEdgesOf(graph) };
};
