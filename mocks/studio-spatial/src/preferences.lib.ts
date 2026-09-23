import { match } from 'ts-pattern';
import type { ViewIntent } from './events.types';
import { required } from './graph.lib';
import { initialReady } from './state.lib';
import type { ReadyState } from './state.types';

export function preferences(state: ReadyState, event: ViewIntent): ReadyState | null {
  const view = state.view;
  return match(event)
    .returnType<ReadyState | null>()
    .with({ type: 'scope.mode' }, (e) => ({
      ...state,
      view: { ...view, scope: { ...view.scope, mode: e.mode } },
    }))
    .with({ type: 'options.change' }, (e) => ({ ...state, view: { ...view, options: e.options } }))
    .with({ type: 'search.change' }, (e) => ({ ...state, view: { ...view, query: e.query } }))
    .with({ type: 'inspector.tab' }, (e) => ({ ...state, view: { ...view, tab: e.tab } }))
    .with({ type: 'help.set' }, (e) => ({ ...state, help: e.open }))
    .otherwise(() => null);
}

export function presentation(state: ReadyState, event: ViewIntent): ReadyState | null {
  return match(event)
    .returnType<ReadyState | null>()
    .with({ type: 'group.toggle' }, (e) => {
      required(state.graph.groups, e.id);
      const expanded = state.view.expanded.includes(e.id)
        ? state.view.expanded.filter((id) => id !== e.id)
        : [...state.view.expanded, e.id];
      return { ...state, view: { ...state.view, expanded } };
    })
    .with({ type: 'groups.expand' }, (e) => ({
      ...state,
      view: { ...state.view, expanded: e.expanded ? [...state.graph.groups.keys()] : [] },
      command: {
        sequence: (state.command?.sequence ?? 0) + 1,
        kind: 'restore',
        viewport: { ...state.viewport, rect: { ...state.viewport.rect, x: 0, y: 0 } },
      },
    }))
    .with({ type: 'view.reset' }, () => ({
      ...initialReady(state.graph, state.requestId),
      command: { sequence: (state.command?.sequence ?? 0) + 1, kind: 'reset' },
    }))
    .otherwise(() => null);
}
