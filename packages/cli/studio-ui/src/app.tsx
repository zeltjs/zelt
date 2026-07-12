import type { Edge, Node, NodeProps } from '@xyflow/react';
import { Background, Controls, Handle, Position, ReactFlow } from '@xyflow/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { DependencyGraph } from '../../src/studio/graph/graph.types';
import { hideNodeModules } from './graph-filter.lib';
import type { CardData, FlowNode, GroupData } from './graph-to-flow.lib';
import { graphToFlow } from './graph-to-flow.lib';
import { findGraphNode } from './inspector.lib';
import { InspectorPanel } from './inspector-panel';
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

  // インスペクタはフィルタ後のグラフから引く（隠れたノードは選択対象外）。
  // useMemo は必須（毎レンダー新規オブジェクトになると下の useEffect が無限再実行される）
  const filteredGraph = useMemo(
    () => (graph === undefined ? undefined : hideModules ? hideNodeModules(graph) : graph),
    [graph, hideModules],
  );

  // フィルタ/グルーピングトグル変更後に nodes/edges を再導出する
  useEffect(() => {
    if (filteredGraph === undefined) return;
    const flow = graphToFlow(filteredGraph, loadPositions(positionScope), {
      grouped: groupByFolder,
    });
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [filteredGraph, groupByFolder, positionScope]);

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
    filteredGraph,
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

const StudioHeader = (props: {
  readonly loading: boolean;
  readonly onReload: () => void;
  readonly hideModules: boolean;
  readonly onToggleHideModules: (value: boolean) => void;
  readonly groupByFolder: boolean;
  readonly onToggleGroupByFolder: (value: boolean) => void;
}): JSX.Element => (
  <header>
    <h1>zelt studio</h1>
    <button type="button" disabled={props.loading} onClick={props.onReload}>
      {props.loading ? 'Analyzing…' : 'Reload'}
    </button>
    <ToggleCheckbox
      label="hide node_modules"
      checked={props.hideModules}
      onChange={props.onToggleHideModules}
    />
    <ToggleCheckbox
      label="group by folder"
      checked={props.groupByFolder}
      onChange={props.onToggleGroupByFolder}
    />
  </header>
);

const GraphCanvas = (props: {
  readonly nodes: FlowNode[];
  readonly edges: Edge[];
  readonly setNodes: (updater: (prev: FlowNode[]) => FlowNode[]) => void;
  readonly positionScope: PositionScope;
  readonly onSelect: (id: string) => void;
  readonly onDeselect: () => void;
}): JSX.Element => (
  <ReactFlow
    nodes={props.nodes}
    edges={props.edges}
    nodeTypes={nodeTypes}
    onNodesChange={(changes) => props.setNodes((prev) => applyStudioNodeChanges(prev, changes))}
    onNodeDragStop={(_event, node) => savePosition(props.positionScope, node.id, node.position)}
    onNodeClick={(_event, node) => {
      if (node.type === 'card') props.onSelect(node.id);
    }}
    onPaneClick={props.onDeselect}
    fitView
  >
    <Background />
    <Controls />
  </ReactFlow>
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
    filteredGraph,
  } = useStudioGraph();
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  // フィルタ/リロードで消えたノードは自動的にパネルも消える（selectedId 自体はクリアしない）
  const selectedNode =
    filteredGraph !== undefined && selectedId !== undefined
      ? findGraphNode(filteredGraph, selectedId)
      : undefined;

  return (
    <div className="studio">
      <StudioHeader
        loading={loading}
        onReload={() => void fetchGraph(true)}
        hideModules={hideModules}
        onToggleHideModules={toggleHideModules}
        groupByFolder={groupByFolder}
        onToggleGroupByFolder={toggleGroupByFolder}
      />
      {error !== undefined && <pre className="error">{error}</pre>}
      <GraphCanvas
        nodes={nodes}
        edges={edges}
        setNodes={setNodes}
        positionScope={positionScope}
        onSelect={setSelectedId}
        onDeselect={() => setSelectedId(undefined)}
      />
      {selectedNode !== undefined && (
        <InspectorPanel node={selectedNode} onClose={() => setSelectedId(undefined)} />
      )}
    </div>
  );
};
