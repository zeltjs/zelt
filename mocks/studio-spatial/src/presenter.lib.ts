import type { ViewportCommand } from './display.types';
import type { Entry } from './graph.lib';
import { required } from './graph.lib';
import { presentDialog, presentInspector } from './inspector-presenter.lib';
import { layout, position } from './layout.lib';
import { presentMap } from './map-presenter.lib';
import type { ControlsModel, RootModel, ToolbarModel } from './presenter.types';
import { focus } from './scope.lib';
import type { ReadyState, StudioState } from './state.types';

function entryLabel({ entry, targetId }: Entry): string {
  return match(entry)
    .with({ kind: 'http' }, (e) => `${e.method} ${e.path} · ${targetId}`)
    .with({ kind: 'event' }, (e) => `Event ${e.eventName} · ${targetId}`)
    .with({ kind: 'middleware' }, () => `Middleware · ${targetId}`)
    .with({ kind: 'lifecycle' }, (e) => `${e.hook} · ${targetId}`)
    .exhaustive();
}

function toolbar(state: ReadyState): ToolbarModel {
  const { graph, view } = state,
    query = view.query.trim().toLowerCase();
  const subjects = [...graph.groups.values(), ...graph.declarations.values()];
  const found = query
    ? subjects.filter((s) =>
        `${s.id} ${s.presentation.hint ?? ''} ${s.source.location.filePath}`
          .toLowerCase()
          .includes(query),
      )
    : [];
  const entries = [...graph.entries.values()]
    .filter(
      (e) =>
        required(graph.owners, e.targetId).presentation.role !== 'composition' &&
        (view.category === 'all' || e.entry.kind === view.category),
    )
    .map((e) => ({ id: e.entry.id, kind: e.entry.kind, label: entryLabel(e) }));
  const origin = [...graph.entries.values()].find((e) => e.targetId === focus(view))?.entry.id;
  return {
    projectName: graph.snapshot.project.name,
    query: view.query,
    category: view.category,
    searchCount: found.length,
    results: found
      .slice(0, 40)
      .map((s) => ({ id: s.id, label: s.name, hint: s.presentation.hint ?? s.kind })),
    entries,
    origin:
      view.scope.kind === 'locked' && entries.some((e) => e.id === origin) ? (origin ?? '') : '',
  };
}

function controls(state: ReadyState): ControlsModel {
  const { view, graph } = state;
  const locked = view.scope.kind === 'locked';
  const selectable =
    view.node !== null && required(graph.owners, view.node).presentation.role !== 'composition';
  const origin = focus(view);
  const scopeStatus = locked
    ? `固定基準: ${origin} · クリックは詳細のみ`
    : origin
      ? `選択に追従: ${origin}`
      : '選択に追従 · 箱を選んでください';
  return {
    mode: view.scope.mode,
    locked,
    canLock: locked || selectable,
    scopeStatus,
    options: view.options,
    canBack: state.history.length > 0,
  };
}

function command(state: ReadyState): ViewportCommand | null {
  const cmd = state.command;
  if (cmd?.kind !== 'locate') return cmd;
  return {
    sequence: cmd.sequence,
    kind: 'locate',
    rect: position(state.graph, state.view, layout(state.graph, state.view), cmd.id),
  };
}

export function present(state: StudioState): RootModel {
  if (state.phase !== 'ready') return state;
  const scenario = state.graph.snapshot.graph.presentation.demoScenarios.at(0);
  return {
    phase: 'ready',
    toolbar: toolbar(state),
    controls: controls(state),
    graph: presentMap(state.graph, state.view),
    command: command(state),
    inspector: presentInspector(state.graph, state.view.node),
    tab: state.view.tab,
    dialog: presentDialog(state),
    help: state.help,
    notice: state.notice,
    demo: scenario
      ? {
          id: scenario.id,
          label: state.view.demo ? '仮変更を戻す' : scenario.label,
          active: state.view.demo === scenario.id,
        }
      : null,
    declarationCount: state.graph.declarations.size,
    groupCount: state.graph.groups.size,
  };
}

import { match } from 'ts-pattern';
