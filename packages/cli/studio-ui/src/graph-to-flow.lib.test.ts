import { describe, expect, it } from 'vitest';

import type { DependencyGraph } from '../../src/studio/graph/graph.types';
import { graphToFlow } from './graph-to-flow.lib';

const graph: DependencyGraph = {
  version: 2,
  nodes: [
    { id: 'src/foo/a.ts#A', className: 'A', filePath: 'src/foo/a.ts', kind: 'controller' },
    { id: 'src/foo/c.ts#C', className: 'C', filePath: 'src/foo/c.ts', kind: 'service' },
    { id: 'src/bar/b.ts#B', className: 'B', filePath: 'src/bar/b.ts', kind: 'service' },
  ],
  edges: [
    { from: 'src/foo/a.ts#A', to: 'src/foo/c.ts#C', kind: 'injects' },
    { from: 'src/foo/a.ts#A', to: 'src/bar/b.ts#B', kind: 'injects' },
  ],
};

describe('graphToFlow', () => {
  it('creates one group node per folder, placed before its member cards', () => {
    const flow = graphToFlow(graph, {}, { grouped: true });

    const groupIds = flow.nodes.filter((n) => n.type === 'folder').map((n) => n.id);
    expect(groupIds.sort()).toEqual(['folder:src/bar', 'folder:src/foo']);

    const indexOf = (id: string): number => flow.nodes.findIndex((n) => n.id === id);
    expect(indexOf('folder:src/foo')).toBeLessThan(indexOf('src/foo/a.ts#A'));
    expect(indexOf('folder:src/foo')).toBeLessThan(indexOf('src/foo/c.ts#C'));
    expect(indexOf('folder:src/bar')).toBeLessThan(indexOf('src/bar/b.ts#B'));
  });

  it('assigns card nodes to their folder group as parent, positioned relative to it', () => {
    const flow = graphToFlow(graph, {}, { grouped: true });

    const a = flow.nodes.find((n) => n.id === 'src/foo/a.ts#A');
    expect(a?.parentId).toBe('folder:src/foo');
    expect(a?.extent).toBe('parent');
    // GROUP_PADDING / GROUP_HEADER 分だけグループ内側にオフセットされる
    expect(a?.position.x).toBeGreaterThanOrEqual(24);
    expect(a?.position.y).toBeGreaterThanOrEqual(32);
  });

  it('keeps edge output identical to input edges regardless of group-level dedup', () => {
    const flow = graphToFlow(graph, {}, { grouped: true });

    expect(flow.edges).toEqual([
      expect.objectContaining({
        id: 'src/foo/a.ts#A->src/foo/c.ts#C#injects',
        source: 'src/foo/a.ts#A',
        target: 'src/foo/c.ts#C',
      }),
      expect.objectContaining({
        id: 'src/foo/a.ts#A->src/bar/b.ts#B#injects',
        source: 'src/foo/a.ts#A',
        target: 'src/bar/b.ts#B',
      }),
    ]);
  });

  it('prefers a saved child position over layout and grows the group to contain it', () => {
    const flow = graphToFlow(graph, { 'src/foo/a.ts#A': { x: 500, y: 600 } }, { grouped: true });

    const a = flow.nodes.find((n) => n.id === 'src/foo/a.ts#A');
    expect(a?.position).toEqual({ x: 500, y: 600 });

    const group = flow.nodes.find((n) => n.id === 'folder:src/foo');
    expect(Number(group?.style?.width)).toBeGreaterThanOrEqual(500 + 240); // + NODE_WIDTH
    expect(Number(group?.style?.height)).toBeGreaterThanOrEqual(600 + 80); // + NODE_HEIGHT
  });

  it('prefers a saved group position over layout', () => {
    const flow = graphToFlow(graph, { 'folder:src/foo': { x: 999, y: 888 } }, { grouped: true });

    const group = flow.nodes.find((n) => n.id === 'folder:src/foo');
    expect(group?.position).toEqual({ x: 999, y: 888 });
  });

  it('groups nodes with "(unknown)" filePath into a single "(unknown)" group', () => {
    const unknownGraph: DependencyGraph = {
      version: 2,
      nodes: [
        { id: 'x#X', className: 'X', filePath: '(unknown)', kind: 'service', unresolved: true },
        { id: 'y#Y', className: 'Y', filePath: '(unknown)', kind: 'service', unresolved: true },
      ],
      edges: [],
    };

    const flow = graphToFlow(unknownGraph, {}, { grouped: true });
    const groups = flow.nodes.filter((n) => n.type === 'folder');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe('folder:(unknown)');
  });

  it('passes node data through for the card renderer', () => {
    const flow = graphToFlow(graph, {}, { grouped: true });
    const a = flow.nodes.find((n) => n.id === 'src/foo/a.ts#A');
    expect(a?.data).toEqual(
      expect.objectContaining({ className: 'A', filePath: 'src/foo/a.ts', kind: 'controller' }),
    );
  });

  describe('flat mode (grouped: false)', () => {
    it('creates no folder group nodes', () => {
      const flow = graphToFlow(graph, {}, { grouped: false });

      expect(flow.nodes.some((n) => n.type === 'folder')).toBe(false);
      expect(flow.nodes).toHaveLength(3);
    });

    it('positions cards without a parent, using absolute coordinates', () => {
      const flow = graphToFlow(graph, {}, { grouped: false });

      const a = flow.nodes.find((n) => n.id === 'src/foo/a.ts#A');
      expect(a?.parentId).toBeUndefined();
      expect(a?.extent).toBeUndefined();
    });

    it('prefers a saved absolute position over layout', () => {
      const flow = graphToFlow(graph, { 'src/foo/a.ts#A': { x: 111, y: 222 } }, { grouped: false });

      const a = flow.nodes.find((n) => n.id === 'src/foo/a.ts#A');
      expect(a?.position).toEqual({ x: 111, y: 222 });
    });

    it('keeps edge output identical to grouped mode', () => {
      const flow = graphToFlow(graph, {}, { grouped: false });

      expect(flow.edges).toEqual([
        expect.objectContaining({ id: 'src/foo/a.ts#A->src/foo/c.ts#C#injects' }),
        expect.objectContaining({ id: 'src/foo/a.ts#A->src/bar/b.ts#B#injects' }),
      ]);
    });
  });

  describe('collapsed groups (grouped: true, collapsedDirs)', () => {
    it('replaces member cards of a collapsed dir with a single module node reusing the folder id', () => {
      const flow = graphToFlow(graph, {}, { grouped: true, collapsedDirs: new Set(['src/foo']) });

      expect(flow.nodes.some((n) => n.id === 'src/foo/a.ts#A')).toBe(false);
      expect(flow.nodes.some((n) => n.id === 'src/foo/c.ts#C')).toBe(false);
      const moduleNode = flow.nodes.find((n) => n.id === 'folder:src/foo');
      expect(moduleNode?.type).toBe('module');
      expect(moduleNode?.data).toEqual(
        expect.objectContaining({ label: 'src/foo', memberCount: 2 }),
      );

      // 折りたたまれていない dir は従来どおり folder subflow + card のまま
      expect(flow.nodes.find((n) => n.id === 'folder:src/bar')?.type).toBe('folder');
      expect(flow.nodes.some((n) => n.id === 'src/bar/b.ts#B')).toBe(true);
    });

    it('reuses saved positions keyed by the folder id for the module node', () => {
      const flow = graphToFlow(
        graph,
        { 'folder:src/foo': { x: 321, y: 654 } },
        { grouped: true, collapsedDirs: new Set(['src/foo']) },
      );

      const moduleNode = flow.nodes.find((n) => n.id === 'folder:src/foo');
      expect(moduleNode?.position).toEqual({ x: 321, y: 654 });
    });

    it('routes edges through the collapsed group id and aggregates parallel edges with a count', () => {
      const flow = graphToFlow(graph, {}, { grouped: true, collapsedDirs: new Set(['src/foo']) });

      // a->c (共に src/foo) は自己ループとして消え、a->b は folder:src/foo -> B に丸め込まれる
      expect(flow.edges).toHaveLength(1);
      expect(flow.edges[0]).toEqual(
        expect.objectContaining({ source: 'folder:src/foo', target: 'src/bar/b.ts#B' }),
      );
    });

    it('is unaffected by collapsedDirs in flat mode', () => {
      const flow = graphToFlow(graph, {}, { grouped: false, collapsedDirs: new Set(['src/foo']) });

      expect(flow.nodes.some((n) => n.type === 'folder' || n.type === 'module')).toBe(false);
      expect(flow.nodes).toHaveLength(3);
    });

    it('defaults to no collapse when collapsedDirs is omitted', () => {
      const withOption = graphToFlow(graph, {}, { grouped: true });
      expect(withOption.nodes.some((n) => n.type === 'module')).toBe(false);
    });

    it('shortens a pnpm-hashed dir to the package name for both module and folder header labels, keeping the full dir separately', () => {
      const pnpmDir =
        'node_modules/.pnpm/@zeltjs+rate-limit@file+..+..+packages+rate-limit_hash/node_modules/@zeltjs/rate-limit/dist';
      const pnpmGraph: DependencyGraph = {
        version: 2,
        nodes: [
          {
            id: `${pnpmDir}/index.ts#R`,
            className: 'R',
            filePath: `${pnpmDir}/index.ts`,
            kind: 'service',
          },
          { id: 'src/a.ts#A', className: 'A', filePath: 'src/a.ts', kind: 'controller' },
        ],
        edges: [],
      };

      const collapsedFlow = graphToFlow(
        pnpmGraph,
        {},
        { grouped: true, collapsedDirs: new Set([pnpmDir]) },
      );
      const moduleNode = collapsedFlow.nodes.find((n) => n.id === `folder:${pnpmDir}`);
      expect(moduleNode?.data).toEqual(
        expect.objectContaining({ label: '@zeltjs/rate-limit', dir: pnpmDir, memberCount: 1 }),
      );

      const expandedFlow = graphToFlow(pnpmGraph, {}, { grouped: true, collapsedDirs: new Set() });
      const folderNode = expandedFlow.nodes.find((n) => n.id === `folder:${pnpmDir}`);
      expect(folderNode?.data).toEqual(
        expect.objectContaining({ label: '@zeltjs/rate-limit', dir: pnpmDir }),
      );
    });
  });

  it('maps edge kind into id and className', () => {
    const graph: DependencyGraph = {
      version: 2,
      nodes: [
        { id: 'a', className: 'A', filePath: 'src/a.ts', kind: 'controller' },
        { id: 'b', className: 'B', filePath: 'src/b.ts', kind: 'middleware' },
      ],
      edges: [
        { from: 'a', to: 'b', kind: 'injects' },
        { from: 'a', to: 'b', kind: 'applies-middleware', methods: ['list'] },
      ],
    };
    const { edges } = graphToFlow(graph, {}, { grouped: false });
    expect(edges).toHaveLength(2);
    expect(edges.map((e) => e.id).sort()).toEqual(['a->b#applies-middleware', 'a->b#injects']);
    expect(edges.find((e) => e.id === 'a->b#applies-middleware')?.className).toBe(
      'edge-applies-middleware',
    );
  });
});
