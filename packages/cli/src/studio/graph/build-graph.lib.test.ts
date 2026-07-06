import { describe, expect, it } from 'vitest';

import { buildDependencyGraph, decoratorsToKind, nodeId } from './build-graph.lib';
import type { DependencyResolver, GraphRoot, ResolvedDependency } from './graph.types';

// map に無いキー = resolver が unresolved を返す
const makeResolver =
  (map: ReadonlyMap<string, readonly ResolvedDependency[]>): DependencyResolver =>
  (filePath, className) => {
    const deps = map.get(nodeId(filePath, className));
    return Promise.resolve(
      deps === undefined
        ? ({ kind: 'unresolved' } as const)
        : ({ kind: 'resolved', deps } as const),
    );
  };

const controllerRoot: GraphRoot = {
  className: 'AController',
  filePath: 'src/a.controller.ts',
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
        [{ className: 'BService', filePath: 'src/b.service.ts', decorators: ['Injectable'] }],
      ],
      [
        nodeId('src/b.service.ts', 'BService'),
        [{ className: 'CConfig', filePath: 'src/c.config.ts', decorators: ['Config'] }],
      ],
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

  it('terminates on circular dependencies and keeps both edges', async () => {
    const map = new Map([
      [
        nodeId('src/a.controller.ts', 'AController'),
        [{ className: 'BService', filePath: 'src/b.service.ts', decorators: [] }],
      ],
      [
        nodeId('src/b.service.ts', 'BService'),
        [{ className: 'AController', filePath: 'src/a.controller.ts', decorators: ['Controller'] }],
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
        filePath: 'src/x.controller.ts',
        kind: 'controller',
        featureKey: 'http',
      },
    ];
    const shared: ResolvedDependency = {
      className: 'SharedService',
      filePath: 'src/shared.service.ts',
      decorators: [],
    };
    const map = new Map([
      [nodeId('src/a.controller.ts', 'AController'), [shared]],
      [nodeId('src/x.controller.ts', 'XController'), [shared]],
      [nodeId('src/shared.service.ts', 'SharedService'), []],
    ]);

    const graph = await buildDependencyGraph(roots, makeResolver(map));

    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
  });

  it('marks nodes the resolver cannot analyze as unresolved', async () => {
    // Dynamic は map に無い = resolver が unresolved を返す
    const map = new Map([
      [
        nodeId('src/a.controller.ts', 'AController'),
        [{ className: 'Dynamic', filePath: 'src/dynamic.ts', decorators: [] }],
      ],
    ]);

    const graph = await buildDependencyGraph([controllerRoot], makeResolver(map));

    const dynamic = graph.nodes.find((n) => n.className === 'Dynamic');
    expect(dynamic?.unresolved).toBe(true);
  });

  it('marks roots without filePath as unresolved and does not recurse into them', async () => {
    const graph = await buildDependencyGraph(
      [{ className: 'Ghost', filePath: undefined, kind: 'service', featureKey: 'http' }],
      makeResolver(new Map()),
    );

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]?.unresolved).toBe(true);
    expect(graph.edges).toHaveLength(0);
  });

  it('keeps two unresolved roots with the same className but different featureKeys distinct', async () => {
    const graph = await buildDependencyGraph(
      [
        { className: 'Ghost', filePath: undefined, kind: 'service', featureKey: 'http' },
        { className: 'Ghost', filePath: undefined, kind: 'service', featureKey: 'cron' },
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
    const resolver: DependencyResolver = (_filePath, className) => {
      calls += 1;
      if (className === 'AController') {
        return Promise.resolve({
          kind: 'resolved' as const,
          deps: [{ className: 'BService', filePath: 'src/b.service.ts', decorators: [] }],
        });
      }
      return Promise.resolve({ kind: 'resolved' as const, deps: [] });
    };

    await buildDependencyGraph(
      [
        controllerRoot,
        {
          className: 'BService',
          filePath: 'src/b.service.ts',
          kind: 'service',
          featureKey: 'http',
        },
      ],
      resolver,
    );

    expect(calls).toBe(2);
  });
});
