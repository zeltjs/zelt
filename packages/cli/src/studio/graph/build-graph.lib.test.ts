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

    expect(graph.version).toBe(1);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.nodes.map((n) => n.kind).sort()).toEqual(['config', 'controller', 'service']);
    // featureKey は起点クラスのみに付く
    expect(graph.nodes.find((n) => n.className === 'AController')?.featureKey).toBe('http');
    expect(graph.nodes.find((n) => n.className === 'BService')?.featureKey).toBeUndefined();
    expect(graph.edges).toEqual([
      {
        from: nodeId('src/a.controller.ts', 'AController'),
        to: nodeId('src/b.service.ts', 'BService'),
      },
      { from: nodeId('src/b.service.ts', 'BService'), to: nodeId('src/c.config.ts', 'CConfig') },
    ]);
  });

  it('merges a class reached both as root and as dependency into one node', async () => {
    // 旧実装では root(trace 由来)と依存(AST 由来)で ID が割れて 2 ノードになっていた。
    // ClassSource 正準化後は同一ノードに合流するのがこの設計の核心
    const adaptorSource = src('src/adaptor.ts', 'Adaptor');
    const roots: GraphRoot[] = [
      controllerRoot,
      { className: 'Adaptor', source: adaptorSource, kind: 'service', featureKey: 'eventbus' },
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
      [{ className: 'Ghost', source: undefined, kind: 'service', featureKey: 'http' }],
      makeResolver(new Map()),
    );

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]?.unresolved).toBe(true);
    expect(graph.edges).toHaveLength(0);
  });

  it('keeps two unresolved roots with the same className but different featureKeys distinct', async () => {
    const graph = await buildDependencyGraph(
      [
        { className: 'Ghost', source: undefined, kind: 'service', featureKey: 'http' },
        { className: 'Ghost', source: undefined, kind: 'service', featureKey: 'cron' },
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
});
