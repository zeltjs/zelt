import { describe, expect, it } from 'vitest';
import { hideNodeModules, isExternalDir } from './graph-filter.lib';
import type { ClassView, ViewNode } from './graph-view.lib';

describe('isExternalDir', () => {
  it('matches dirs produced for external nodes ("ext:" prefix)', () => {
    expect(isExternalDir('ext:pkg')).toBe(true);
    expect(isExternalDir('ext:@scope/pkg')).toBe(true);
  });

  it('does not match ordinary project dirs', () => {
    expect(isExternalDir('src/foo')).toBe(false);
    expect(isExternalDir('src/cart')).toBe(false);
  });
});

const node = (overrides: Partial<ViewNode> & { readonly id: string }): ViewNode => ({
  name: overrides.id,
  filePath: 'src/a.ts',
  fileKind: null,
  external: false,
  decorators: [],
  routes: [],
  methods: [],
  ...overrides,
});

describe('hideNodeModules', () => {
  const view: ClassView = {
    nodes: [
      node({ id: 'src/a.ts#A', filePath: 'src/a.ts' }),
      node({ id: 'ext:pkg#N', filePath: 'ext:pkg', external: true }),
      node({ id: 'src/b.ts#B', filePath: 'src/b.ts' }),
    ],
    edges: [
      { from: 'src/a.ts#A', to: 'ext:pkg#N', kind: 'injects' },
      { from: 'src/a.ts#A', to: 'src/b.ts#B', kind: 'injects' },
      { from: 'ext:pkg#N', to: 'src/b.ts#B', kind: 'injects' },
    ],
  };

  it('excludes external nodes and every edge that touches them', () => {
    const filtered = hideNodeModules(view);
    expect(filtered.nodes.map((n) => n.id)).toEqual(['src/a.ts#A', 'src/b.ts#B']);
    expect(filtered.edges).toEqual([{ from: 'src/a.ts#A', to: 'src/b.ts#B', kind: 'injects' }]);
  });

  it('keeps non-external nodes/edges untouched', () => {
    const filtered = hideNodeModules(view);
    expect(filtered.nodes[0]).toEqual(view.nodes[0]);
    expect(filtered.edges[0]).toEqual(view.edges[1]);
  });
});
