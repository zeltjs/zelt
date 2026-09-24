import type { Graph } from './graph.lib';
import { required } from './graph.lib';
import type { ReadyState, UrlState, ViewState } from './state.types';

export function initialView(graph: Graph): ViewState {
  return {
    node: null,
    scope: { kind: 'following', mode: 'near' },
    tab: 'contract',
    expanded: [],
    options: {
      showTypes: true,
      showCounts: true,
      hiddenColumns: graph.snapshot.graph.presentation.columns
        .filter((c) => c.initiallyHidden)
        .map((c) => c.id),
    },
    query: '',
  };
}

export function initialReady(graph: Graph, requestId: number): ReadyState {
  return {
    phase: 'ready',
    requestId,
    graph,
    view: initialView(graph),
    help: false,
    history: [],
    viewport: { zoom: 1, rect: { x: 0, y: 0, width: 0, height: 0 } },
    command: null,
    notice: null,
  };
}

// Reaching a subject must never leave it inside a column the map does not draw.
function reveal(state: ReadyState, id: string): ViewState {
  const owner = required(state.graph.owners, id);
  const expanded = state.graph.declarations.has(id)
    ? [...new Set([...state.view.expanded, owner.id])]
    : state.view.expanded;
  const hiddenColumns = state.view.options.hiddenColumns.filter(
    (c) => c !== owner.presentation.columnId,
  );
  return { ...state.view, expanded, options: { ...state.view.options, hiddenColumns } };
}

export function select(state: ReadyState, id: string): ReadyState {
  return {
    ...state,
    view: { ...reveal(state, id), node: id, tab: 'contract', query: '' },
  };
}

export function locate(state: ReadyState, id: string): ReadyState {
  return {
    ...state,
    view: reveal(state, id),
    command: { sequence: (state.command?.sequence ?? 0) + 1, kind: 'locate', id },
  };
}

export function startScope(state: ReadyState, id: string): ReadyState {
  const selected = select(state, id);
  return {
    ...selected,
    view: { ...selected.view, scope: { kind: 'locked', mode: 'flow', anchor: id } },
  };
}

export function toggleColumn(state: ReadyState, id: string, visible: boolean): ReadyState {
  const columns = state.graph.snapshot.graph.presentation.columns;
  if (!columns.some((c) => c.id === id)) throw new Error(`Unknown column: ${id}`);
  const rest = state.view.options.hiddenColumns.filter((c) => c !== id);
  const hiddenColumns = visible ? rest : [...rest, id];
  return { ...state, view: { ...state.view, options: { ...state.view.options, hiddenColumns } } };
}

export function urlState(view: ViewState): UrlState {
  return {
    node: view.node,
    root: view.scope.kind === 'locked' ? view.scope.anchor : null,
    mode: view.scope.mode,
    tab: view.tab,
  };
}

export function restoreUrl(state: ReadyState, url: UrlState): ReadyState {
  if (url.root !== null) required(state.graph.owners, url.root);
  const selected = url.node === null ? state : locate(select(state, url.node), url.node);
  const scope =
    url.root === null
      ? ({ kind: 'following', mode: url.mode } satisfies ViewState['scope'])
      : ({ kind: 'locked', mode: url.mode, anchor: url.root } satisfies ViewState['scope']);
  return {
    ...selected,
    notice: null,
    view: { ...selected.view, node: url.node, tab: url.tab, scope },
  };
}
