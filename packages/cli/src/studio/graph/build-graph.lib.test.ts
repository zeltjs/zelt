import type { ClassSource } from '@zeltjs/decorator-metadata/inspect';
import { describe, expect, it } from 'vitest';

import { buildDependencyGraph, decoratorsToKind, nodeId } from './build-graph.lib';
import type { DependencyResolution, DependencyResolver, GraphRoot } from './graph.types';

const src = (filePath: string, exportName: string): ClassSource => ({ filePath, exportName });

const idOf = (s: ClassSource): string => nodeId(s.filePath, s.exportName);

// map に無いキー = resolver が external を返す（node_modules 等の展開対象外)
const makeResolver =
  (map: ReadonlyMap<string, readonly DependencyResolution[]>): DependencyResolver =>
  (source) => {
    const deps = map.get(idOf(source));
    return Promise.resolve(
      deps === undefined ? ({ kind: 'external' } as const) : ({ kind: 'resolved', deps } as const),
    );
  };

const dep = (filePath: string, exportName: string, decorators: readonly string[] = []) =>
  ({ kind: 'class', source: src(filePath, exportName), decorators }) as const;

const controllerRoot: GraphRoot = {
  className: 'AController',
  source: src('src/a.controller.ts', 'AController'),
  kind: 'controller',
  featureKey: 'http',
  decorators: ['Controller'],
};

describe('decoratorsToKind', () => {
  it.each([
    [['Controller'], 'controller'],
    [['Command'], 'command'],
    [['Config'], 'config'],
    [['Middleware'], 'middleware'],
    [['ErrorHandler'], 'error-handler'],
    [['Injectable'], 'service'],
    [[], 'service'],
  ])('maps %j to %s', (decorators, expected) => {
    expect(decoratorsToKind(decorators)).toBe(expected);
  });
});

describe('buildDependencyGraph', () => {
  it('walks a linear chain controller -> service -> config', async () => {
    const map = new Map([
      [
        nodeId('src/a.controller.ts', 'AController'),
        [dep('src/b.service.ts', 'BService', ['Injectable'])],
      ],
      [nodeId('src/b.service.ts', 'BService'), [dep('src/c.config.ts', 'CConfig', ['Config'])]],
      [nodeId('src/c.config.ts', 'CConfig'), []],
    ]);

    const graph = await buildDependencyGraph([controllerRoot], makeResolver(map));

    expect(graph.version).toBe(2);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.nodes.map((n) => n.kind).sort()).toEqual(['config', 'controller', 'service']);
    // featureKey は起点クラスのみに付く
    expect(graph.nodes.find((n) => n.className === 'AController')?.featureKey).toBe('http');
    expect(graph.nodes.find((n) => n.className === 'BService')?.featureKey).toBeUndefined();
    expect(graph.edges).toEqual([
      {
        from: nodeId('src/a.controller.ts', 'AController'),
        to: nodeId('src/b.service.ts', 'BService'),
        kind: 'injects',
      },
      {
        from: nodeId('src/b.service.ts', 'BService'),
        to: nodeId('src/c.config.ts', 'CConfig'),
        kind: 'injects',
      },
    ]);
  });

  it('merges a class reached both as root and as dependency into one node', async () => {
    // 旧実装では root(trace 由来)と依存(AST 由来)で ID が割れて 2 ノードになっていた。
    // ClassSource 正準化後は同一ノードに合流するのがこの設計の核心
    const adaptorSource = src('src/adaptor.ts', 'Adaptor');
    const roots: GraphRoot[] = [
      controllerRoot,
      {
        className: 'Adaptor',
        source: adaptorSource,
        kind: 'service',
        featureKey: 'eventbus',
        decorators: [],
      },
    ];
    const map = new Map([
      [nodeId('src/a.controller.ts', 'AController'), [dep('src/adaptor.ts', 'Adaptor')]],
      [nodeId('src/adaptor.ts', 'Adaptor'), []],
    ]);

    const graph = await buildDependencyGraph(roots, makeResolver(map));

    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes.find((n) => n.className === 'Adaptor')?.featureKey).toBe('eventbus');
    expect(graph.edges).toEqual([
      {
        from: nodeId('src/a.controller.ts', 'AController'),
        to: nodeId('src/adaptor.ts', 'Adaptor'),
        kind: 'injects',
      },
    ]);
  });

  it('terminates on circular dependencies and keeps both edges', async () => {
    const map = new Map([
      [nodeId('src/a.controller.ts', 'AController'), [dep('src/b.service.ts', 'BService')]],
      [
        nodeId('src/b.service.ts', 'BService'),
        [dep('src/a.controller.ts', 'AController', ['Controller'])],
      ],
    ]);

    const graph = await buildDependencyGraph([controllerRoot], makeResolver(map));

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(2);
  });

  it('deduplicates a shared dependency and its node', async () => {
    const roots: GraphRoot[] = [
      controllerRoot,
      {
        className: 'XController',
        source: src('src/x.controller.ts', 'XController'),
        kind: 'controller',
        featureKey: 'http',
        decorators: ['Controller'],
      },
    ];
    const shared = dep('src/shared.service.ts', 'SharedService');
    const map = new Map([
      [nodeId('src/a.controller.ts', 'AController'), [shared]],
      [nodeId('src/x.controller.ts', 'XController'), [shared]],
      [nodeId('src/shared.service.ts', 'SharedService'), []],
    ]);

    const graph = await buildDependencyGraph(roots, makeResolver(map));

    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
  });

  it('keeps external dependencies as leaf nodes without marking them unresolved', async () => {
    // resolver が external を返すノード（node_modules 等）は展開されないだけで赤ではない
    const map = new Map([
      [
        nodeId('src/a.controller.ts', 'AController'),
        [dep('node_modules/pkg/dist/index.js', 'Ext')],
      ],
    ]);

    const graph = await buildDependencyGraph([controllerRoot], makeResolver(map));

    const ext = graph.nodes.find((n) => n.className === 'Ext');
    expect(ext?.unresolved).toBeUndefined();
    expect(graph.edges).toHaveLength(1);
  });

  it('renders per-dependency unresolved entries as unresolved nodes', async () => {
    const map = new Map<string, readonly DependencyResolution[]>([
      [nodeId('src/a.controller.ts', 'AController'), [{ kind: 'unresolved', localName: 'Hidden' }]],
    ]);

    const graph = await buildDependencyGraph([controllerRoot], makeResolver(map));

    const hidden = graph.nodes.find((n) => n.className === 'Hidden');
    expect(hidden?.unresolved).toBe(true);
    expect(graph.edges).toHaveLength(1);
  });

  it('marks the node unresolved when the resolver fails for that class', async () => {
    const resolver: DependencyResolver = (source) =>
      Promise.resolve(
        source.exportName === 'AController'
          ? { kind: 'resolved', deps: [dep('src/dynamic.ts', 'Dynamic')] }
          : { kind: 'unresolved' },
      );

    const graph = await buildDependencyGraph([controllerRoot], resolver);

    const dynamic = graph.nodes.find((n) => n.className === 'Dynamic');
    expect(dynamic?.unresolved).toBe(true);
  });

  it('marks roots without a ClassSource as unresolved and does not recurse into them', async () => {
    const graph = await buildDependencyGraph(
      [
        {
          className: 'Ghost',
          source: undefined,
          kind: 'service',
          featureKey: 'http',
          decorators: [],
        },
      ],
      makeResolver(new Map()),
    );

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]?.unresolved).toBe(true);
    expect(graph.edges).toHaveLength(0);
  });

  it('keeps two unresolved roots with the same className but different featureKeys distinct', async () => {
    const graph = await buildDependencyGraph(
      [
        {
          className: 'Ghost',
          source: undefined,
          kind: 'service',
          featureKey: 'http',
          decorators: [],
        },
        {
          className: 'Ghost',
          source: undefined,
          kind: 'service',
          featureKey: 'cron',
          decorators: [],
        },
      ],
      makeResolver(new Map()),
    );

    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes.every((n) => n.unresolved)).toBe(true);
    expect(graph.nodes.every((n) => n.filePath === '(unknown)')).toBe(true);
    expect(new Set(graph.nodes.map((n) => n.id)).size).toBe(2);
  });

  it('does not visit the same node twice even if it appears as root and dependency', async () => {
    let calls = 0;
    const resolver: DependencyResolver = (source) => {
      calls += 1;
      if (source.exportName === 'AController') {
        return Promise.resolve({
          kind: 'resolved' as const,
          deps: [dep('src/b.service.ts', 'BService')],
        });
      }
      return Promise.resolve({ kind: 'resolved' as const, deps: [] });
    };

    await buildDependencyGraph(
      [
        controllerRoot,
        {
          className: 'BService',
          source: src('src/b.service.ts', 'BService'),
          kind: 'service',
          featureKey: 'http',
          decorators: [],
        },
      ],
      resolver,
    );

    expect(calls).toBe(2);
  });

  it('relativizes displayed file paths with formatPath while keeping ids consistent', async () => {
    const graph = await buildDependencyGraph([controllerRoot], makeResolver(new Map()), {
      formatPath: (p) => p.replace('src/', ''),
    });

    expect(graph.nodes[0]?.filePath).toBe('a.controller.ts');
    expect(graph.nodes[0]?.id).toBe(nodeId('a.controller.ts', 'AController'));
  });

  it('adds applies-middleware edges and seeds middleware nodes into the queue', async () => {
    const mwSource = src('/app/logging.middleware.ts', 'LoggingMiddleware');
    const roots: GraphRoot[] = [
      {
        className: 'UserController',
        source: src('/app/user.controller.ts', 'UserController'),
        kind: 'controller',
        featureKey: 'http',
        decorators: ['Controller', 'UseMiddleware'],
        routes: [{ method: 'GET', path: '/users', handler: 'list' }],
        appliedMiddlewares: [
          { className: 'LoggingMiddleware', source: mwSource, decorators: ['Middleware'] },
          { className: 'AuthMiddleware', source: undefined, decorators: [], methods: ['list'] },
        ],
      },
    ];
    // middleware の inject 依存も展開されることを確認するため resolver を記録する
    const visited: string[] = [];
    const graph = await buildDependencyGraph(roots, async (source) => {
      visited.push(source.exportName);
      return { kind: 'resolved', deps: [] };
    });

    expect(visited).toContain('LoggingMiddleware');
    const byClass = new Map(graph.nodes.map((n) => [n.className, n]));
    const nodeOf = (className: string) => {
      const node = byClass.get(className);
      if (!node) throw new Error(`node not found: ${className}`);
      return node;
    };
    expect(nodeOf('LoggingMiddleware').kind).toBe('middleware');
    expect(nodeOf('AuthMiddleware').unresolved).toBe(true);
    expect(nodeOf('UserController').routes).toEqual([
      { method: 'GET', path: '/users', handler: 'list' },
    ]);
    expect(nodeOf('UserController').decorators).toEqual(['Controller', 'UseMiddleware']);
    expect(graph.edges).toContainEqual({
      from: nodeOf('UserController').id,
      to: nodeOf('LoggingMiddleware').id,
      kind: 'applies-middleware',
    });
    expect(graph.edges).toContainEqual({
      from: nodeOf('UserController').id,
      to: nodeOf('AuthMiddleware').id,
      kind: 'applies-middleware',
      methods: ['list'],
    });
    expect(graph.version).toBe(2);
  });

  it('attaches contracts via resolveContract for resolved nodes only', async () => {
    const roots: GraphRoot[] = [
      {
        className: 'UserService',
        source: src('/app/user.service.ts', 'UserService'),
        kind: 'service',
        featureKey: 'http',
        decorators: ['Injectable'],
      },
    ];
    const contract = [{ name: 'find', params: [], returnType: 'string' }];
    const graph = await buildDependencyGraph(roots, async () => ({ kind: 'resolved', deps: [] }), {
      resolveContract: async () => contract,
    });
    expect(graph.nodes[0]?.contract).toEqual(contract);
  });

  // spec 5節の不変条件: external / unresolved ノードには contract が付かない
  it('does not call resolveContract for external or unresolved nodes', async () => {
    const roots: GraphRoot[] = [
      {
        className: 'UserController',
        source: src('/app/user.controller.ts', 'UserController'),
        kind: 'controller',
        featureKey: 'http',
        decorators: ['Controller'],
      },
    ];
    const calls: string[] = [];
    const graph = await buildDependencyGraph(
      roots,
      async (source) =>
        source.exportName === 'UserController'
          ? {
              kind: 'resolved',
              deps: [
                { kind: 'class', source: src('/x/ext.ts', 'ExternalDep'), decorators: [] },
                { kind: 'unresolved', localName: 'Ghost' },
              ],
            }
          : { kind: 'external' },
      {
        resolveContract: async (source) => {
          calls.push(source.exportName);
          return [];
        },
      },
    );
    expect(calls).toEqual(['UserController']);
    expect(graph.nodes.find((n) => n.className === 'ExternalDep')?.contract).toBeUndefined();
    expect(graph.nodes.find((n) => n.className === 'Ghost')?.contract).toBeUndefined();
  });

  // spec 5節: program 内の契約抽出失敗は fatal（reject が伝播する）
  it('rejects when resolveContract rejects', async () => {
    const roots: GraphRoot[] = [
      {
        className: 'UserService',
        source: src('/app/user.service.ts', 'UserService'),
        kind: 'service',
        featureKey: 'http',
        decorators: [],
      },
    ];
    await expect(
      buildDependencyGraph(roots, async () => ({ kind: 'resolved', deps: [] }), {
        resolveContract: async () => {
          throw new Error('SIGNATURE_NOT_FOUND: boom');
        },
      }),
    ).rejects.toThrow('SIGNATURE_NOT_FOUND');
  });

  it('dedups applies-middleware edges for the same pair', async () => {
    const mwSource = src('/app/logging.middleware.ts', 'LoggingMiddleware');
    const mw = { className: 'LoggingMiddleware', source: mwSource, decorators: ['Middleware'] };
    const roots: GraphRoot[] = [
      {
        className: 'UserController',
        source: src('/app/user.controller.ts', 'UserController'),
        kind: 'controller',
        featureKey: 'http',
        decorators: ['Controller'],
        // 同一 middleware が複数経路で発見されてもエッジは 1 本
        appliedMiddlewares: [mw, mw],
      },
    ];
    const graph = await buildDependencyGraph(roots, async () => ({ kind: 'resolved', deps: [] }));
    expect(graph.edges.filter((e) => e.kind === 'applies-middleware')).toHaveLength(1);
  });

  it('keeps injects and applies-middleware edges between the same node pair distinct', async () => {
    const mwSource = src('/app/logging.middleware.ts', 'LoggingMiddleware');
    const roots: GraphRoot[] = [
      {
        className: 'UserController',
        source: src('/app/user.controller.ts', 'UserController'),
        kind: 'controller',
        featureKey: 'http',
        decorators: ['Controller'],
        appliedMiddlewares: [
          { className: 'LoggingMiddleware', source: mwSource, decorators: ['Middleware'] },
        ],
      },
    ];
    // controller が同じ middleware を inject もしている（適用 + 注入の 2 本）
    const graph = await buildDependencyGraph(roots, async (source) =>
      source.exportName === 'UserController'
        ? {
            kind: 'resolved',
            deps: [{ kind: 'class', source: mwSource, decorators: ['Middleware'] }],
          }
        : { kind: 'resolved', deps: [] },
    );
    const kinds = graph.edges.map((e) => e.kind).sort();
    expect(kinds).toEqual(['applies-middleware', 'injects']);
  });
});
