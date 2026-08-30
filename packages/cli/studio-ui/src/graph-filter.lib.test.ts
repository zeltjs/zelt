import { describe, expect, it } from 'vitest';

import type { DependencyGraph } from '../../src/studio/graph/graph.types';
import { hideNodeModules, isNodeModulesPath } from './graph-filter.lib';

describe('isNodeModulesPath', () => {
  it('matches node_modules as a path segment, wherever it appears', () => {
    expect(isNodeModulesPath('node_modules/pkg/index.ts')).toBe(true);
    expect(isNodeModulesPath('../node_modules/pkg/index.ts')).toBe(true);
    expect(isNodeModulesPath('node_modules/.pnpm/pkg@1.0.0/node_modules/dep/index.ts')).toBe(true);
  });

  it('does not match names that merely contain "node_modules"', () => {
    expect(isNodeModulesPath('src/foo/node_modules_like.ts')).toBe(false);
    expect(isNodeModulesPath('src/cart/cart.service.ts')).toBe(false);
  });
});

describe('hideNodeModules', () => {
  const graph: DependencyGraph = {
    version: 2,
    nodes: [
      { id: 'src/a.ts#A', className: 'A', filePath: 'src/a.ts', kind: 'controller' },
      {
        id: 'node_modules/pkg/index.ts#N',
        className: 'N',
        filePath: 'node_modules/pkg/index.ts',
        kind: 'service',
      },
      { id: 'src/b.ts#B', className: 'B', filePath: 'src/b.ts', kind: 'service' },
    ],
    edges: [
      { from: 'src/a.ts#A', to: 'node_modules/pkg/index.ts#N', kind: 'injects' },
      { from: 'src/a.ts#A', to: 'src/b.ts#B', kind: 'injects' },
      { from: 'node_modules/pkg/index.ts#N', to: 'src/b.ts#B', kind: 'injects' },
    ],
  };

  it('excludes node_modules nodes and every edge that touches them', () => {
    const filtered = hideNodeModules(graph);
    expect(filtered.nodes.map((n) => n.id)).toEqual(['src/a.ts#A', 'src/b.ts#B']);
    expect(filtered.edges).toEqual([{ from: 'src/a.ts#A', to: 'src/b.ts#B', kind: 'injects' }]);
  });

  it('keeps version and non-node_modules nodes/edges untouched', () => {
    const filtered = hideNodeModules(graph);
    expect(filtered.version).toBe(2);
    expect(filtered.nodes[0]).toEqual(graph.nodes[0]);
    expect(filtered.edges[0]).toEqual(graph.edges[1]);
  });
});
