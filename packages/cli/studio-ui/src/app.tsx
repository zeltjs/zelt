import type { Edge, Node, NodeProps } from '@xyflow/react';
import { Background, Controls, Handle, Position, ReactFlow } from '@xyflow/react';
import type { JSX } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { DependencyGraph } from '../../src/studio/graph/graph.types';
import { dirOf } from './collapse.lib';
import { hideNodeModules } from './graph-filter.lib';
import type { CardData, FlowNode, GroupData, ModuleData } from './graph-to-flow.lib';
import { graphToFlow } from './graph-to-flow.lib';
import { findGraphNode } from './inspector.lib';
import { InspectorPanel } from './inspector-panel';
import { applyStudioNodeChanges } from './node-changes.lib';
import type { PositionScope } from './positions.lib';
import { loadPositions, savePosition } from './positions.lib';
import {
  defaultCollapsedDirs,
  loadCollapsedDirs,
  loadGroupByFolder,
  loadHideNodeModules,
  saveCollapsedDirs,
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

// nodeTypes はモジュールスコープで一度だけ定義する必要がある（毎レンダー再生成すると
// React Flow が custom node を再マウントする）ため、折りたたみトグルは props でなく
// context 経由で FolderNode/ModuleNode に注入する
const CollapseToggleContext = createContext<(dir: string) => void>(() => {});

// メンバーはクラス単位のため "1 class" / "N classes" で表記する
const classCountLabel = (count: number): string => `${count} ${count === 1 ? 'class' : 'classes'}`;

// フォルダは表示上のグルーピング枠。エッジは card 間にしか引かれないため Handle 不要。
// data.label は pnpm ハッシュ等を短縮した表示用文字列のため、折りたたみ操作は data.dir（フルパス、collapsedDirs のキー）で行う
const FolderNode = ({ data }: NodeProps<Node<GroupData, 'folder'>>): JSX.Element => {
  const toggleCollapsed = useContext(CollapseToggleContext);
  return (
    <div className="folder">
      <div className="folder-header">
        <span className="folder-label" title={data.dir}>
          {data.label}
        </span>
        <button
          type="button"
          className="folder-collapse-btn"
          title={`Collapse ${data.dir}`}
          onClick={(event) => {
            event.stopPropagation();
            toggleCollapsed(data.dir);
          }}
        >
          −
        </button>
      </div>
    </div>
  );
};

// 折りたたみグループの合成ノード。エッジがここへ束ねられるため card と同じく Handle が要る。
// 表示は短縮ラベルのみなので、フルパスは title（ホバー）で確認できるようにする
const ModuleNode = ({ data }: NodeProps<Node<ModuleData, 'module'>>): JSX.Element => {
  const toggleCollapsed = useContext(CollapseToggleContext);
  return (
    <button
      type="button"
      className="module"
      title={data.dir}
      onClick={(event) => {
        event.stopPropagation();
        toggleCollapsed(data.dir);
      }}
    >
      <Handle type="target" position={Position.Top} />
      <span className="module-expand">+</span>
      <strong>{data.label}</strong>
      <small>{classCountLabel(data.memberCount)}</small>
      <Handle type="source" position={Position.Bottom} />
    </button>
  );
};

const nodeTypes = { card: CardNode, folder: FolderNode, module: ModuleNode };

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

// 保存値が無い初回だけ、到着したグラフの dir 一覧から node_modules 系を自動折りたたみする。
// 一度でも保存されていれば（空集合＝全展開を含め）以後はユーザーの選択を優先する
const useCollapsedDirs = (
  graph: DependencyGraph | undefined,
): [ReadonlySet<string>, (dir: string) => void] => {
  const [collapsedDirs, setCollapsedDirs] = useState<ReadonlySet<string>>(
    () => loadCollapsedDirs() ?? new Set(),
  );
  const hasAppliedDefault = useRef(loadCollapsedDirs() !== undefined);

  useEffect(() => {
    if (hasAppliedDefault.current || graph === undefined) return;
    const dirs = Array.from(new Set(graph.nodes.map((node) => dirOf(node.filePath))));
    setCollapsedDirs(defaultCollapsedDirs(dirs));
    hasAppliedDefault.current = true;
  }, [graph]);

  const toggleDir = useCallback((dir: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      saveCollapsedDirs(next);
      return next;
    });
  }, []);

  return [collapsedDirs, toggleDir];
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
  const [collapsedDirs, toggleCollapsedDir] = useCollapsedDirs(filteredGraph);

  // フィルタ/グルーピング/折りたたみトグル変更後に nodes/edges を再導出する
  useEffect(() => {
    if (filteredGraph === undefined) return;
    const flow = graphToFlow(filteredGraph, loadPositions(positionScope), {
      grouped: groupByFolder,
      collapsedDirs,
    });
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [filteredGraph, groupByFolder, positionScope, collapsedDirs]);

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
    toggleCollapsedDir,
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
    toggleCollapsedDir,
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
      <CollapseToggleContext.Provider value={toggleCollapsedDir}>
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          setNodes={setNodes}
          positionScope={positionScope}
          onSelect={setSelectedId}
          onDeselect={() => setSelectedId(undefined)}
        />
      </CollapseToggleContext.Provider>
      {selectedNode !== undefined && (
        <InspectorPanel node={selectedNode} onClose={() => setSelectedId(undefined)} />
      )}
    </div>
  );
};
