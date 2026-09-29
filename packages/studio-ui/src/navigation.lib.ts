import { match } from 'ts-pattern';
import type { ViewIntent } from './events.types';
import { required } from './graph.lib';
import { attachments } from './relations.lib';
import { locate, select, startScope } from './state.lib';
import type { ReadyState } from './state.types';

/** @throws {Error} */
function lock(state: ReadyState, locked: boolean): ReadyState {
  if (!locked)
    return {
      ...state,
      view: { ...state.view, scope: { kind: 'following', mode: state.view.scope.mode } },
    };
  const id = state.view.scope.kind === 'locked' ? state.view.scope.anchor : state.view.node;
  if (id === null) throw new Error('ロックする箱を選んでください');
  required(state.graph.owners, id);
  return {
    ...state,
    view: { ...state.view, scope: { kind: 'locked', mode: state.view.scope.mode, anchor: id } },
  };
}

/** @throws {Error} */
export function navigate(state: ReadyState, event: ViewIntent): ReadyState | null {
  return match(event)
    .with({ type: 'subject.select' }, (e) => select(state, e.id))
    .with({ type: 'subject.find' }, (e) => locate(select(state, e.id), e.id))
    .with({ type: 'subject.locate' }, (e) => locate(state, e.id))
    .with({ type: 'scope.start' }, (e) => startScope(state, e.id))
    .with({ type: 'scope.lock' }, (e) => lock(state, e.locked))
    .otherwise(() => null);
}

/** @throws {Error} */
function jump(state: ReadyState, id: string): ReadyState {
  const next = locate(select(state, id), id);
  return { ...next, history: [...state.history, { view: state.view, viewport: state.viewport }] };
}

/** @throws {Error} */
function back(state: ReadyState): ReadyState {
  const previous = state.history.at(-1);
  if (!previous) throw new Error('戻る参照履歴がありません');
  return {
    ...state,
    view: previous.view,
    history: state.history.slice(0, -1),
    command: {
      sequence: (state.command?.sequence ?? 0) + 1,
      kind: 'restore',
      viewport: previous.viewport,
    },
  };
}

/** @throws {Error} */
function activateTag(state: ReadyState, key: string): ReadyState {
  const note = attachments(
    state.graph,
    state.view.options.hiddenColumns,
    state.view.options.showTypes,
  ).find((n) => n.key === key);
  if (!note) throw new Error('表示中の参照タグが見つかりません');
  return jump(state, note.target);
}

/** @throws {Error} */
export function reference(state: ReadyState, event: ViewIntent): ReadyState | null {
  return match(event)
    .returnType<ReadyState | null>()
    .with({ type: 'reference.back' }, () => back(state))
    .with({ type: 'tag.activate' }, (e) => activateTag(state, e.key))
    .otherwise(() => null);
}
