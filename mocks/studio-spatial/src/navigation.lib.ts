import { match } from 'ts-pattern';
import type { ViewIntent } from './events.types';
import { required } from './graph.lib';
import { attachments } from './relations.lib';
import { locate, requireMapSubject, select, startScope } from './state.lib';
import type { ReadyState } from './state.types';

function lock(state: ReadyState, locked: boolean): ReadyState {
  if (!locked)
    return {
      ...state,
      view: { ...state.view, scope: { kind: 'following', mode: state.view.scope.mode } },
    };
  const id = state.view.scope.kind === 'locked' ? state.view.scope.anchor : state.view.node;
  if (id === null) throw new Error('ロックする箱を選んでください');
  requireMapSubject(state.graph, id);
  return {
    ...state,
    view: { ...state.view, scope: { kind: 'locked', mode: state.view.scope.mode, anchor: id } },
  };
}

export function navigate(state: ReadyState, event: ViewIntent): ReadyState | null {
  return match(event)
    .with({ type: 'subject.select' }, (e) => select(state, e.id))
    .with({ type: 'subject.find' }, (e) => locate(select(state, e.id), e.id))
    .with({ type: 'subject.locate' }, (e) => locate(state, e.id))
    .with({ type: 'scope.start' }, (e) => startScope(state, e.id))
    .with({ type: 'scope.lock' }, (e) => lock(state, e.locked))
    .with({ type: 'entry.choose' }, (e) => {
      const entry = required(state.graph.entries, e.id);
      return locate(startScope(state, entry.targetId), entry.targetId);
    })
    .otherwise(() => null);
}

function jump(state: ReadyState, id: string): ReadyState {
  const next = locate(select(state, id), id);
  return { ...next, history: [...state.history, { view: state.view, viewport: state.viewport }] };
}

function back(state: ReadyState): ReadyState {
  const previous = state.history.at(-1);
  if (!previous) throw new Error('戻る参照履歴がありません');
  return {
    ...state,
    view: previous.view,
    history: state.history.slice(0, -1),
    dialog: null,
    command: {
      sequence: (state.command?.sequence ?? 0) + 1,
      kind: 'restore',
      viewport: previous.viewport,
    },
  };
}

function activateTag(state: ReadyState, key: string): ReadyState {
  const note = attachments(
    state.graph,
    state.view.options.showConfig,
    state.view.options.showTypes,
  ).find((n) => n.key === key);
  if (!note) throw new Error('表示中の参照タグが見つかりません');
  return note.kind === 'config'
    ? {
        ...state,
        dialog: {
          kind: 'relations',
          groupId: note.groupId,
          relationIds: note.relations.map((r) => r.id),
        },
      }
    : jump(state, note.target);
}

export function reference(state: ReadyState, event: ViewIntent): ReadyState | null {
  return match(event)
    .returnType<ReadyState | null>()
    .with({ type: 'reference.jump' }, (e) => jump(state, e.id))
    .with({ type: 'reference.back' }, () => back(state))
    .with({ type: 'tag.activate' }, (e) => activateTag(state, e.key))
    .with({ type: 'composition.open' }, () => ({ ...state, dialog: { kind: 'composition' } }))
    .with({ type: 'composition.source' }, () => {
      const selected = select(state, 'createEcApp');
      return { ...selected, view: { ...selected.view, tab: 'source' } };
    })
    .with({ type: 'dialog.close' }, () => ({ ...state, dialog: null }))
    .otherwise(() => null);
}
