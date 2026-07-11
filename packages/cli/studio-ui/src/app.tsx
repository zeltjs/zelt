import type { Edge, Node, NodeProps } from '@xyflow/react';
import { Background, Controls, Handle, Position, ReactFlow } from '@xyflow/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { DependencyGraph } from '../../src/studio/graph/graph.types';
import { hideNodeModules } from './graph-filter.lib';
import type { CardData, FlowNode, GroupData } from './graph-to-flow.lib';
import { graphToFlow } from './graph-to-flow.lib';
import { applyStudioNodeChanges } from './node-changes.lib';
import { loadPositions, savePosition } from './positions.lib';
import { loadHideNodeModules, saveHideNodeModules } from './settings.lib';

type AnalyzeResult =
  | { ok: true; readonly graph: DependencyGraph }
  | { ok: false; readonly errorOutput: string };

// Handle が無いと React Flow はエッジを描画しない（read-only でも必須）
const CardNode = ({ data }: NodeProps<Node<CardData, 'card'>>): JSX.Element => (
  <div className={`card kind-${data.kind}${data.unresolved ? ' unresolved' : ''}`}>
    <Handle type="target" position={Position.Top} />
    <span className="badge">{data.kind}</span>
    <strong>{data.className}</strong>
    <small>{data.filePath}</small>
    <Handle type="source" position={Position.Bottom} />
  </div>
);

// フォルダは表示上のグルーピング枠のみで、エッジは card 間にしか引かれないため Handle 不要
const FolderNode = ({ data }: NodeProps<Node<GroupData, 'folder'>>): JSX.Element => (
  <div className="folder">
    <span className="folder-label">{data.label}</span>
  </div>
);

const nodeTypes = { card: CardNode, folder: FolderNode };

const useStudioGraph = () => {
  const [graph, setGraph] = useState<DependencyGraph | undefined>(undefined);
  const [hideModules, setHideModules] = useState(() => loadHideNodeModules());
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const apply = useCallback((result: AnalyzeResult) => {
    if (result.ok) {
      setGraph(result.graph);
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

  // グラフ取得後、および hide トグル変更後に nodes/edges を再導出する。
  // フィルタ後の graph から生成すれば node_modules フォルダの枠も自動的に消える
  useEffect(() => {
    if (graph === undefined) return;
    const target = hideModules ? hideNodeModules(graph) : graph;
    const flow = graphToFlow(target, loadPositions());
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [graph, hideModules]);

  const toggleHideModules = useCallback((value: boolean) => {
    setHideModules(value);
    saveHideNodeModules(value);
  }, []);

  return { nodes, setNodes, edges, error, loading, fetchGraph, hideModules, toggleHideModules };
};

export const App = (): JSX.Element => {
  const { nodes, setNodes, edges, error, loading, fetchGraph, hideModules, toggleHideModules } =
    useStudioGraph();

  return (
    <div className="studio">
      <header>
        <h1>zelt studio</h1>
        <button type="button" disabled={loading} onClick={() => void fetchGraph(true)}>
          {loading ? 'Analyzing…' : 'Reload'}
        </button>
        <label className="toggle">
          <input
            type="checkbox"
            checked={hideModules}
            onChange={(e) => toggleHideModules(e.target.checked)}
          />
          hide node_modules
        </label>
      </header>
      {error !== undefined && <pre className="error">{error}</pre>}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={(changes) => setNodes((prev) => applyStudioNodeChanges(prev, changes))}
        onNodeDragStop={(_event, node) => savePosition(node.id, node.position)}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
};
