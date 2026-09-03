import { describe, expect, it } from 'vitest';

import type { DependencyGraph } from '../../src/studio/graph/graph.types';
import { collapseView, dirOf, displayDirLabel, groupIdOf } from './collapse.lib';

const graph: DependencyGraph = {
  version: 2,
  nodes: [
    { id: 'src/foo/a.ts#A', className: 'A', filePath: 'src/foo/a.ts', kind: 'controller' },
    { id: 'src/foo/c.ts#C', className: 'C', filePath: 'src/foo/c.ts', kind: 'service' },
    { id: 'src/bar/b.ts#B', className: 'B', filePath: 'src/bar/b.ts', kind: 'service' },
    { id: 'src/bar/d.ts#D', className: 'D', filePath: 'src/bar/d.ts', kind: 'service' },
  ],
  edges: [
    { from: 'src/foo/a.ts#A', to: 'src/bar/b.ts#B', kind: 'injects' },
    { from: 'src/foo/c.ts#C', to: 'src/bar/d.ts#D', kind: 'injects' },
    { from: 'src/foo/a.ts#A', to: 'src/foo/c.ts#C', kind: 'injects' },
    { from: 'src/bar/b.ts#B', to: 'src/bar/d.ts#D', kind: 'injects' },
  ],
};

describe('dirOf', () => {
  it('returns the directory portion of a file path', () => {
    expect(dirOf('src/foo/a.ts')).toBe('src/foo');
  });

  it('returns the whole string when there is no slash (e.g. "(unknown)")', () => {
    expect(dirOf('(unknown)')).toBe('(unknown)');
  });
});

describe('groupIdOf', () => {
  it('prefixes the dir with "folder:"', () => {
    expect(groupIdOf('src/foo')).toBe('folder:src/foo');
  });
});

describe('displayDirLabel', () => {
  it('returns the dir unchanged when it has no node_modules segment', () => {
    expect(displayDirLabel('src/usecase')).toBe('src/usecase');
  });

  it('collapses a pnpm-hashed nested path down to the scoped package name', () => {
    const dir =
      'node_modules/.pnpm/@zeltjs+rate-limit@file+..+..+packages+rate-limit_@zeltjs+core@file+..+..+packages+core_b6cdb2bde8c859a81ae30c51a943ff80/node_modules/@zeltjs/rate-limit/dist';
    expect(displayDirLabel(dir)).toBe('@zeltjs/rate-limit');
  });

  it('takes one segment for an unscoped package, dropping trailing segments like dist', () => {
    expect(displayDirLabel('node_modules/pkg/dist/lib')).toBe('pkg');
  });

  it('takes two segments for a scoped package directly under node_modules', () => {
    expect(displayDirLabel('node_modules/@zeltjs/rate-limit/dist')).toBe('@zeltjs/rate-limit');
  });

  it('uses the last node_modules segment when there are nested node_modules', () => {
    expect(displayDirLabel('node_modules/a/node_modules/b/node_modules/c/dist')).toBe('c');
  });

  it('falls back to the full dir when node_modules is the last segment (nothing after it)', () => {
    expect(displayDirLabel('vendor/node_modules')).toBe('vendor/node_modules');
  });
});

describe('collapseView', () => {
  it('is equivalent to the input when nothing is collapsed', () => {
    const view = collapseView(graph, new Set());

    expect(view.visibleNodes).toEqual(graph.nodes);
    expect(view.collapsedGroups).toEqual([]);
    expect(view.edges).toEqual([
      { from: 'src/foo/a.ts#A', to: 'src/bar/b.ts#B', kind: 'injects', count: 1 },
      { from: 'src/foo/c.ts#C', to: 'src/bar/d.ts#D', kind: 'injects', count: 1 },
      { from: 'src/foo/a.ts#A', to: 'src/foo/c.ts#C', kind: 'injects', count: 1 },
      { from: 'src/bar/b.ts#B', to: 'src/bar/d.ts#D', kind: 'injects', count: 1 },
    ]);
  });

  it('collapses member nodes of a collapsed dir into a single folder group', () => {
    const view = collapseView(graph, new Set(['src/foo']));

    expect(view.visibleNodes.map((n) => n.id)).toEqual(['src/bar/b.ts#B', 'src/bar/d.ts#D']);
    expect(view.collapsedGroups).toEqual([{ dir: 'src/foo', memberCount: 2 }]);
  });

  it('aggregates parallel edges between the same endpoints and kind into a count', () => {
    const view = collapseView(graph, new Set(['src/foo', 'src/bar']));

    // a->b と c->d はどちらも folder:src/foo -> folder:src/bar (injects) に丸め込まれ集約される
    expect(view.edges).toContainEqual({
      from: 'folder:src/foo',
      to: 'folder:src/bar',
      kind: 'injects',
      count: 2,
    });
  });

  it('drops edges that become self-loops within the same collapsed group', () => {
    const view = collapseView(graph, new Set(['src/foo', 'src/bar']));

    // src/foo/a->src/foo/c と src/bar/b->src/bar/d はどちらも自己ループになり除去される
    expect(view.edges.some((e) => e.from === e.to)).toBe(false);
    expect(view.edges).toHaveLength(1);
  });

  it('preserves a pre-existing self-loop when nothing is collapsed', () => {
    const selfLoopGraph: DependencyGraph = {
      version: 2,
      nodes: [{ id: 'src/foo/a.ts#A', className: 'A', filePath: 'src/foo/a.ts', kind: 'service' }],
      edges: [{ from: 'src/foo/a.ts#A', to: 'src/foo/a.ts#A', kind: 'injects' }],
    };

    const view = collapseView(selfLoopGraph, new Set());
    expect(view.edges).toEqual([
      { from: 'src/foo/a.ts#A', to: 'src/foo/a.ts#A', kind: 'injects', count: 1 },
    ]);
  });

  it('keeps edges of different kinds separate even between the same endpoints', () => {
    const twoKindGraph: DependencyGraph = {
      version: 2,
      nodes: [
        { id: 'src/foo/a.ts#A', className: 'A', filePath: 'src/foo/a.ts', kind: 'controller' },
        { id: 'src/bar/b.ts#B', className: 'B', filePath: 'src/bar/b.ts', kind: 'middleware' },
      ],
      edges: [
        { from: 'src/foo/a.ts#A', to: 'src/bar/b.ts#B', kind: 'injects' },
        { from: 'src/foo/a.ts#A', to: 'src/bar/b.ts#B', kind: 'applies-middleware' },
      ],
    };

    const view = collapseView(twoKindGraph, new Set(['src/foo', 'src/bar']));
    expect([...view.edges].sort((x, y) => x.kind.localeCompare(y.kind))).toEqual([
      { from: 'folder:src/foo', to: 'folder:src/bar', kind: 'applies-middleware', count: 1 },
      { from: 'folder:src/foo', to: 'folder:src/bar', kind: 'injects', count: 1 },
    ]);
  });

  it('rewrites only the collapsed endpoint when just one side is collapsed', () => {
    const view = collapseView(graph, new Set(['src/foo']));

    expect(view.edges).toContainEqual({
      from: 'folder:src/foo',
      to: 'src/bar/b.ts#B',
      kind: 'injects',
      count: 1,
    });
    expect(view.edges).toContainEqual({
      from: 'src/bar/b.ts#B',
      to: 'src/bar/d.ts#D',
      kind: 'injects',
      count: 1,
    });
  });

  it('ignores collapsedDirs entries that do not correspond to any node', () => {
    const view = collapseView(graph, new Set(['does/not/exist']));

    expect(view.visibleNodes).toEqual(graph.nodes);
    expect(view.collapsedGroups).toEqual([]);
  });
});
