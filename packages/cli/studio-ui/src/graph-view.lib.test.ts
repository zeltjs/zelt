import { describe, expect, it } from 'vitest';

import type { DependencyGraph } from '../../src/studio/graph/graph.types';
import { toClassView } from './graph-view.lib';

describe('toClassView', () => {
  it("aggregates a ClassNode's http-entry FnNodes into routes, keyed by matching filePath+owner", () => {
    const graph: DependencyGraph = {
      version: 3,
      nodes: [
        {
          id: 'src/a.controller.ts#AController',
          kind: 'class',
          name: 'AController',
          filePath: 'src/a.controller.ts',
          module: 'src',
          fileKind: 'controller',
          decorators: ['Controller'],
          loc: { start: 1, end: 10 },
        },
        {
          id: 'src/a.controller.ts#AController.list',
          name: 'list',
          owner: 'AController',
          filePath: 'src/a.controller.ts',
          module: 'src',
          fileKind: 'controller',
          decorators: ['Get'],
          entry: { kind: 'http', method: 'GET', path: '/api/a' },
          contract: { params: [], returnType: 'void' },
          visibility: 'public',
          loc: { start: 2, end: 4 },
        },
        // 別ファイルの同名メソッドは owner が一致していても filePath が違うため含めない
        {
          id: 'src/other.ts#AController.list',
          name: 'list',
          owner: 'AController',
          filePath: 'src/other.ts',
          module: 'src',
          fileKind: null,
          decorators: [],
          entry: { kind: 'http', method: 'GET', path: '/api/other' },
          contract: { params: [], returnType: 'void' },
          visibility: 'public',
          loc: { start: 1, end: 2 },
        },
      ],
      edges: [],
      tests: [],
    };

    const view = toClassView(graph);
    expect(view.nodes).toHaveLength(1);
    expect(view.nodes[0]).toEqual(
      expect.objectContaining({
        id: 'src/a.controller.ts#AController',
        name: 'AController',
        filePath: 'src/a.controller.ts',
        fileKind: 'controller',
        external: false,
        decorators: ['Controller'],
        routes: [{ method: 'GET', path: '/api/a', handler: 'list' }],
      }),
    );
  });

  it('collects public FnNode methods into ViewNode.methods, excluding private ones', () => {
    const graph: DependencyGraph = {
      version: 3,
      nodes: [
        {
          id: 'src/b.service.ts#BService',
          kind: 'class',
          name: 'BService',
          filePath: 'src/b.service.ts',
          module: 'src',
          fileKind: 'service',
          decorators: [],
          loc: { start: 1, end: 10 },
        },
        {
          id: 'src/b.service.ts#BService.run',
          name: 'run',
          owner: 'BService',
          filePath: 'src/b.service.ts',
          module: 'src',
          fileKind: 'service',
          decorators: [],
          contract: { params: [{ name: 'x', type: 'number' }], returnType: 'void' },
          visibility: 'public',
          loc: { start: 2, end: 4 },
        },
        {
          id: 'src/b.service.ts#BService.helper',
          name: 'helper',
          owner: 'BService',
          filePath: 'src/b.service.ts',
          module: 'src',
          fileKind: 'service',
          decorators: [],
          contract: { params: [], returnType: 'void' },
          visibility: 'private',
          loc: { start: 5, end: 6 },
        },
      ],
      edges: [],
      tests: [],
    };

    const view = toClassView(graph);
    expect(view.nodes[0]?.methods).toEqual([
      { name: 'run', params: [{ name: 'x', type: 'number' }], returnType: 'void' },
    ]);
  });

  it('converts an ExternalNode into an external ViewNode with filePath ext:<package>', () => {
    const graph: DependencyGraph = {
      version: 3,
      nodes: [
        {
          id: 'ext:@zeltjs/eventbus#MemoryEventBusAdaptor',
          external: true,
          package: '@zeltjs/eventbus',
          member: 'MemoryEventBusAdaptor',
        },
      ],
      edges: [],
      tests: [],
    };

    const view = toClassView(graph);
    expect(view.nodes).toEqual([
      {
        id: 'ext:@zeltjs/eventbus#MemoryEventBusAdaptor',
        name: 'MemoryEventBusAdaptor',
        filePath: 'ext:@zeltjs/eventbus',
        fileKind: null,
        external: true,
        decorators: [],
        routes: [],
        methods: [],
      },
    ]);
  });

  it('excludes owner-less (module-scope) FnNodes and FnNodes whose owner has no matching ClassNode', () => {
    const graph: DependencyGraph = {
      version: 3,
      nodes: [
        {
          id: 'src/util.lib.ts#format',
          name: 'format',
          filePath: 'src/util.lib.ts',
          module: 'src',
          fileKind: 'lib',
          decorators: [],
          contract: { params: [], returnType: 'string' },
          visibility: 'public',
          loc: { start: 1, end: 2 },
        },
        {
          id: 'src/orphan.ts#Orphan.run',
          name: 'run',
          owner: 'Orphan',
          filePath: 'src/orphan.ts',
          module: 'src',
          fileKind: null,
          decorators: [],
          contract: { params: [], returnType: 'void' },
          visibility: 'public',
          loc: { start: 1, end: 2 },
        },
      ],
      edges: [],
      tests: [],
    };

    const view = toClassView(graph);
    expect(view.nodes).toEqual([]);
  });

  it('keeps injects/applies-middleware edges (dropping line) and drops calls/event edges', () => {
    const graph: DependencyGraph = {
      version: 3,
      nodes: [],
      edges: [
        { kind: 'injects', from: 'a', to: 'b', line: 10 },
        { kind: 'applies-middleware', from: 'a', to: 'c', methods: ['list'], line: 11 },
        { kind: 'applies-middleware', from: 'a', to: 'd', line: 12 },
        { kind: 'calls', from: 'a', to: 'e', context: 'plain', awaited: false, line: 13 },
        { kind: 'event', from: 'a', to: 'f', event: 'order:created', line: 14 },
      ],
      tests: [],
    };

    const view = toClassView(graph);
    expect(view.edges).toEqual([
      { kind: 'injects', from: 'a', to: 'b' },
      { kind: 'applies-middleware', from: 'a', to: 'c', methods: ['list'] },
      { kind: 'applies-middleware', from: 'a', to: 'd' },
    ]);
  });
});
