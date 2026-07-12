import type { Edge, Node, NodeProps } from '@xyflow/react';
import { Background, Controls, Handle, Position, ReactFlow } from '@xyflow/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { DependencyGraph } from '../../src/studio/graph/graph.types';
import { hideNodeModules } from './graph-filter.lib';
import type { CardData, FlowNode, GroupData } from './graph-to-flow.lib';
import { graphToFlow } from './graph-to-flow.lib';
import { applyStudioNodeChanges } from './node-changes.lib';
import type { PositionScope } from './positions.lib';
import { loadPositions, savePosition } from './positions.lib';
import {
  loadGroupByFolder,
  loadHideNodeModules,
  saveGroupByFolder,
  saveHideNodeModules,
} from './settings.lib';

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

// reload のカスタムヘッダは cross-site だと CORS preflight を通過できないため、
// サーバ側の CSRF 判定（same-origin の証明）に使われる
const requestGraph = async (reload: boolean): Promise<AnalyzeResult> => {
  const res = await fetch(
    reload ? '/api/reload' : '/api/graph',
    reload ? { method: 'POST', headers: { 'x-zelt-studio': 'reload' } } : { method: 'GET' },
  );
  // 403 等は body が空で json() が SyntaxError になるため、先に status で弾く
  if (!res.ok) {
    return { ok: false, errorOutput: `HTTP ${res.status} ${res.statusText}` };
  }
  return (await res.json()) as AnalyzeResult;
};

// localStorage 連動の boolean トグル（hide node_modules / group by folder）で
// state 更新 + 永続化のペアが重複するため束ねる
const useToggleSetting = (
  load: () => boolean,
  save: (value: boolean) => void,
): [boolean, (value: boolean) => void] => {
  const [value, setValue] = useState(load);
  const toggle = useCallback(
    (next: boolean) => {
      setValue(next);
      save(next);
    },
    [save],
  );
  return [value, toggle];
};

const deriveFlow = (
  graph: DependencyGraph,
  hideModules: boolean,
  groupByFolder: boolean,
  positionScope: PositionScope,
): { nodes: FlowNode[]; edges: Edge[] } => {
  // フィルタ後の graph から生成すれば node_modules フォルダの枠も自動的に消える
  const target = hideModules ? hideNodeModules(graph) : graph;
  return graphToFlow(target, loadPositions(positionScope), { grouped: groupByFolder });
};

const useGraphFetch = () => {
  const [graph, setGraph] = useState<DependencyGraph | undefined>(undefined);
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
        apply(await requestGraph(reload));
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

  return { graph, error, loading, fetchGraph };
};

const useStudioGraph = () => {
  const { graph, error, loading, fetchGraph } = useGraphFetch();
  const [hideModules, toggleHideModules] = useToggleSetting(
    loadHideNodeModules,
    saveHideNodeModules,
  );
  const [groupByFolder, toggleGroupByFolder] = useToggleSetting(
    loadGroupByFolder,
    saveGroupByFolder,
  );
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const positionScope: PositionScope = groupByFolder ? 'grouped' : 'flat';

  // グラフ取得後、および hide/grouping トグル変更後に nodes/edges を再導出する
  useEffect(() => {
    if (graph === undefined) return;
    const flow = deriveFlow(graph, hideModules, groupByFolder, positionScope);
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [graph, hideModules, groupByFolder, positionScope]);

  return {
    nodes,
    setNodes,
    edges,
    error,
    loading,
    fetchGraph,
    hideModules,
    toggleHideModules,
    groupByFolder,
    toggleGroupByFolder,
    positionScope,
  };
};

const ToggleCheckbox = (props: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (value: boolean) => void;
}): JSX.Element => (
  <label className="toggle">
    <input
      type="checkbox"
      checked={props.checked}
      onChange={(e) => props.onChange(e.target.checked)}
    />
    {props.label}
  </label>
);

export const App = (): JSX.Element => {
  const {
    nodes,
    setNodes,
    edges,
    error,
    loading,
    fetchGraph,
    hideModules,
    toggleHideModules,
    groupByFolder,
    toggleGroupByFolder,
    positionScope,
  } = useStudioGraph();

  return (
    <div className="studio">
      <header>
        <h1>zelt studio</h1>
        <button type="button" disabled={loading} onClick={() => void fetchGraph(true)}>
          {loading ? 'Analyzing…' : 'Reload'}
        </button>
        <ToggleCheckbox
          label="hide node_modules"
          checked={hideModules}
          onChange={toggleHideModules}
        />
        <ToggleCheckbox
          label="group by folder"
          checked={groupByFolder}
          onChange={toggleGroupByFolder}
        />
      </header>
      {error !== undefined && <pre className="error">{error}</pre>}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={(changes) => setNodes((prev) => applyStudioNodeChanges(prev, changes))}
        onNodeDragStop={(_event, node) => savePosition(positionScope, node.id, node.position)}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
};
