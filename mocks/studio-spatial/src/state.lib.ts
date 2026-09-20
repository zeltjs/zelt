import type { Graph } from './graph.lib';
import { required } from './graph.lib';
import type { ReadyState, UrlState, ViewState } from './state.types';

export function initialView(): ViewState {
  return {
    node: null,
    scope: { kind: 'following', mode: 'near' },
    tab: 'contract',
    expanded: [],
    options: { showTypes: true, showCounts: true, showConfig: true },
    query: '',
    category: 'all',
    demo: null,
  };
}

export function initialReady(graph: Graph, requestId: number): ReadyState {
  return {
    phase: 'ready',
    requestId,
    graph,
    view: initialView(),
    dialog: null,
    help: false,
    history: [],
    viewport: { zoom: 1, rect: { x: 0, y: 0, width: 0, height: 0 } },
    command: null,
    notice: null,
  };
}

export function select(state: ReadyState, id: string): ReadyState {
  const owner = required(state.graph.owners, id);
  const expanded = state.graph.declarations.has(id)
    ? [...new Set([...state.view.expanded, owner.id])]
    : state.view.expanded;
  return {
    ...state,
    dialog: null,
    view: {
      ...state.view,
      node: id,
      tab: 'contract',
      expanded,
      query: '',
      options: {
        ...state.view.options,
        showConfig: state.view.options.showConfig || owner.presentation.role === 'config',
      },
    },
  };
}

export function requireMapSubject(graph: Graph, id: string): void {
  if (required(graph.owners, id).presentation.role === 'composition')
    throw new Error(`地図の起点にはできません: ${id}`);
}

export function locate(state: ReadyState, id: string): ReadyState {
  const owner = required(state.graph.owners, id);
  if (owner.presentation.role === 'composition')
    return { ...state, dialog: { kind: 'composition' } };
  const expanded = state.graph.declarations.has(id)
    ? [...new Set([...state.view.expanded, owner.id])]
    : state.view.expanded;
  return {
    ...state,
    view: {
      ...state.view,
      expanded,
      options: {
        ...state.view.options,
        showConfig: state.view.options.showConfig || owner.presentation.role === 'config',
      },
    },
    command: { sequence: (state.command?.sequence ?? 0) + 1, kind: 'locate', id },
  };
}

export function startScope(state: ReadyState, id: string): ReadyState {
  requireMapSubject(state.graph, id);
  const selected = select(state, id);
  return {
    ...selected,
    view: { ...selected.view, scope: { kind: 'locked', mode: 'flow', anchor: id } },
  };
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
  if (url.root !== null) requireMapSubject(state.graph, url.root);
  const selected = url.node === null ? state : locate(select(state, url.node), url.node);
  const scope =
    url.root === null
      ? ({ kind: 'following', mode: url.mode } satisfies ViewState['scope'])
      : ({ kind: 'locked', mode: url.mode, anchor: url.root } satisfies ViewState['scope']);
  return {
    ...selected,
    dialog: null,
    notice: null,
    view: { ...selected.view, node: url.node, tab: url.tab, scope },
  };
}
