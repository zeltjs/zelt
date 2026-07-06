import type { Edge, NodeChange, NodeProps } from '@xyflow/react';
import { Background, Controls, ReactFlow } from '@xyflow/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { DependencyGraph } from '../../src/studio/graph/graph.types';
import type { FlowNode } from './graph-to-flow.lib';
import { graphToFlow } from './graph-to-flow.lib';
import { loadPositions, savePosition } from './positions.lib';

type AnalyzeResult =
  | { ok: true; readonly graph: DependencyGraph }
  | { ok: false; readonly errorOutput: string };

const CardNode = ({ data }: NodeProps<FlowNode>): JSX.Element => (
  <div className={`card kind-${data.kind}${data.unresolved ? ' unresolved' : ''}`}>
    <span className="badge">{data.kind}</span>
    <strong>{data.className}</strong>
    <small>{data.filePath}</small>
  </div>
);

const nodeTypes = { card: CardNode };

// ドラッグ移動のみ反映する（削除等は扱わない）
const applyPositionChanges = (nodes: FlowNode[], changes: NodeChange<FlowNode>[]): FlowNode[] =>
  changes.reduce(
    (acc, change) =>
      change.type === 'position' && change.position
        ? acc.map((n) =>
            n.id === change.id ? { ...n, position: change.position ?? n.position } : n,
          )
        : acc,
    nodes,
  );

const useStudioGraph = () => {
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const apply = useCallback((result: AnalyzeResult) => {
    if (result.ok) {
      const flow = graphToFlow(result.graph, loadPositions());
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setError(undefined);
    } else {
      setError(result.errorOutput);
    }
  }, []);

  const fetchGraph = useCallback(
    async (reload: boolean) => {
      setLoading(true);
      try {
        const res = await fetch(reload ? '/api/reload' : '/api/graph', {
          method: reload ? 'POST' : 'GET',
        });
        apply((await res.json()) as AnalyzeResult);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [apply],
  );

  useEffect(() => {
    void fetchGraph(false);
  }, [fetchGraph]);

  return { nodes, setNodes, edges, error, loading, fetchGraph };
};

export const App = (): JSX.Element => {
  const { nodes, setNodes, edges, error, loading, fetchGraph } = useStudioGraph();

  return (
    <div className="studio">
      <header>
        <h1>zelt studio</h1>
        <button type="button" disabled={loading} onClick={() => void fetchGraph(true)}>
          {loading ? 'Analyzing…' : 'Reload'}
        </button>
      </header>
      {error !== undefined && <pre className="error">{error}</pre>}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={(changes) => setNodes((prev) => applyPositionChanges(prev, changes))}
        onNodeDragStop={(_event, node) => savePosition(node.id, node.position)}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
};
