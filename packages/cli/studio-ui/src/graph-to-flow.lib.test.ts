import { describe, expect, it } from 'vitest';

import type { DependencyGraph } from '../../src/studio/graph/graph.types';
import { graphToFlow } from './graph-to-flow.lib';

const graph: DependencyGraph = {
  version: 1,
  nodes: [
    { id: 'a.ts#A', className: 'A', filePath: 'a.ts', kind: 'controller' },
    { id: 'b.ts#B', className: 'B', filePath: 'b.ts', kind: 'service' },
  ],
  edges: [{ from: 'a.ts#A', to: 'b.ts#B' }],
};

describe('graphToFlow', () => {
  it('converts nodes and edges to react-flow shape with dagre positions', () => {
    const flow = graphToFlow(graph, {});

    expect(flow.nodes).toHaveLength(2);
    expect(flow.edges).toEqual([
      expect.objectContaining({ id: 'a.ts#A->b.ts#B', source: 'a.ts#A', target: 'b.ts#B' }),
    ]);
    // dagre レイアウトで親子の縦位置が分かれている
    const [a, b] = flow.nodes;
    expect(a?.position.y).not.toBe(b?.position.y);
  });

  it('prefers saved positions over layout', () => {
    const flow = graphToFlow(graph, { 'a.ts#A': { x: 123, y: 456 } });
    const a = flow.nodes.find((n) => n.id === 'a.ts#A');
    expect(a?.position).toEqual({ x: 123, y: 456 });
  });

  it('passes node data through for the card renderer', () => {
    const flow = graphToFlow(graph, {});
    const a = flow.nodes.find((n) => n.id === 'a.ts#A');
    expect(a?.data).toEqual(
      expect.objectContaining({ className: 'A', filePath: 'a.ts', kind: 'controller' }),
    );
  });
});
