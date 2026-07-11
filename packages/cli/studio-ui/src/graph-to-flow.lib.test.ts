import { describe, expect, it } from 'vitest';

import type { DependencyGraph } from '../../src/studio/graph/graph.types';
import { graphToFlow } from './graph-to-flow.lib';

const graph: DependencyGraph = {
  version: 1,
  nodes: [
    { id: 'src/foo/a.ts#A', className: 'A', filePath: 'src/foo/a.ts', kind: 'controller' },
    { id: 'src/foo/c.ts#C', className: 'C', filePath: 'src/foo/c.ts', kind: 'service' },
    { id: 'src/bar/b.ts#B', className: 'B', filePath: 'src/bar/b.ts', kind: 'service' },
  ],
  edges: [
    { from: 'src/foo/a.ts#A', to: 'src/foo/c.ts#C' },
    { from: 'src/foo/a.ts#A', to: 'src/bar/b.ts#B' },
  ],
};

describe('graphToFlow', () => {
  it('creates one group node per folder, placed before its member cards', () => {
    const flow = graphToFlow(graph, {});

    const groupIds = flow.nodes.filter((n) => n.type === 'folder').map((n) => n.id);
    expect(groupIds.sort()).toEqual(['folder:src/bar', 'folder:src/foo']);

    const indexOf = (id: string): number => flow.nodes.findIndex((n) => n.id === id);
    expect(indexOf('folder:src/foo')).toBeLessThan(indexOf('src/foo/a.ts#A'));
    expect(indexOf('folder:src/foo')).toBeLessThan(indexOf('src/foo/c.ts#C'));
    expect(indexOf('folder:src/bar')).toBeLessThan(indexOf('src/bar/b.ts#B'));
  });

  it('assigns card nodes to their folder group as parent, positioned relative to it', () => {
    const flow = graphToFlow(graph, {});

    const a = flow.nodes.find((n) => n.id === 'src/foo/a.ts#A');
    expect(a?.parentId).toBe('folder:src/foo');
    expect(a?.extent).toBe('parent');
    // GROUP_PADDING / GROUP_HEADER 分だけグループ内側にオフセットされる
    expect(a?.position.x).toBeGreaterThanOrEqual(24);
    expect(a?.position.y).toBeGreaterThanOrEqual(32);
  });

  it('keeps edge output identical to input edges regardless of group-level dedup', () => {
    const flow = graphToFlow(graph, {});

    expect(flow.edges).toEqual([
      expect.objectContaining({
        id: 'src/foo/a.ts#A->src/foo/c.ts#C',
        source: 'src/foo/a.ts#A',
        target: 'src/foo/c.ts#C',
      }),
      expect.objectContaining({
        id: 'src/foo/a.ts#A->src/bar/b.ts#B',
        source: 'src/foo/a.ts#A',
        target: 'src/bar/b.ts#B',
      }),
    ]);
  });

  it('prefers a saved child position over layout and grows the group to contain it', () => {
    const flow = graphToFlow(graph, { 'src/foo/a.ts#A': { x: 500, y: 600 } });

    const a = flow.nodes.find((n) => n.id === 'src/foo/a.ts#A');
    expect(a?.position).toEqual({ x: 500, y: 600 });

    const group = flow.nodes.find((n) => n.id === 'folder:src/foo');
    expect(Number(group?.style?.width)).toBeGreaterThanOrEqual(500 + 240); // + NODE_WIDTH
    expect(Number(group?.style?.height)).toBeGreaterThanOrEqual(600 + 80); // + NODE_HEIGHT
  });

  it('prefers a saved group position over layout', () => {
    const flow = graphToFlow(graph, { 'folder:src/foo': { x: 999, y: 888 } });

    const group = flow.nodes.find((n) => n.id === 'folder:src/foo');
    expect(group?.position).toEqual({ x: 999, y: 888 });
  });

  it('groups nodes with "(unknown)" filePath into a single "(unknown)" group', () => {
    const unknownGraph: DependencyGraph = {
      version: 1,
      nodes: [
        { id: 'x#X', className: 'X', filePath: '(unknown)', kind: 'service', unresolved: true },
        { id: 'y#Y', className: 'Y', filePath: '(unknown)', kind: 'service', unresolved: true },
      ],
      edges: [],
    };

    const flow = graphToFlow(unknownGraph, {});
    const groups = flow.nodes.filter((n) => n.type === 'folder');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe('folder:(unknown)');
  });

  it('passes node data through for the card renderer', () => {
    const flow = graphToFlow(graph, {});
    const a = flow.nodes.find((n) => n.id === 'src/foo/a.ts#A');
    expect(a?.data).toEqual(
      expect.objectContaining({ className: 'A', filePath: 'src/foo/a.ts', kind: 'controller' }),
    );
  });
});
