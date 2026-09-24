import type { ViewportCommand } from './display.types';
import { required, subject } from './graph.lib';
import { presentInspector } from './inspector-presenter.lib';
import { layout, position } from './layout.lib';
import { presentMap } from './map-presenter.lib';
import type { ControlsModel, RootModel, ToolbarModel } from './presenter.types';
import { focus } from './scope.lib';
import type { SourceDeclaration, SourceGroup } from './snapshot.types';
import type { ReadyState, StudioState } from './state.types';

function hintText(s: SourceGroup | SourceDeclaration): string {
  return s.hints.map((h) => h.label).join(' · ');
}

function toolbar(state: ReadyState): ToolbarModel {
  const { graph, view } = state,
    query = view.query.trim().toLowerCase();
  const subjects = [...graph.groups.values(), ...graph.declarations.values()].map((s) => ({
    subject: s,
    label: graph.groups.has(s.id) ? s.name : `${required(graph.owners, s.id).name}#${s.name}`,
  }));
  const found = query
    ? subjects.filter(({ subject: s, label }) =>
        `${label} ${hintText(s)} ${s.source.location.filePath}`.toLowerCase().includes(query),
      )
    : [];
  return {
    projectName: graph.snapshot.project.name,
    query: view.query,
    searchCount: found.length,
    results: found
      .slice(0, 40)
      .map(({ subject: s, label }) => ({ id: s.id, label, hint: hintText(s) || s.kind })),
  };
}

function controls(state: ReadyState): ControlsModel {
  const { view, graph } = state;
  const locked = view.scope.kind === 'locked';
  const origin = focus(view);
  const name = origin === null ? null : subject(graph, origin).name;
  const scopeStatus = locked
    ? `固定基準: ${name} · クリックは詳細のみ`
    : name !== null
      ? `選択に追従: ${name}`
      : '選択に追従 · 箱を選んでください';
  return {
    mode: view.scope.mode,
    locked,
    canLock: locked || view.node !== null,
    scopeStatus,
    options: { showTypes: view.options.showTypes, showCounts: view.options.showCounts },
    columns: graph.snapshot.graph.presentation.columns.map((c) => ({
      id: c.id,
      label: c.label,
      visible: !view.options.hiddenColumns.includes(c.id),
    })),
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
  return {
    phase: 'ready',
    toolbar: toolbar(state),
    controls: controls(state),
    graph: presentMap(state.graph, state.view),
    command: command(state),
    inspector: presentInspector(state.graph, state.view.node),
    tab: state.view.tab,
    help: state.help,
    notice: state.notice,
    declarationCount: state.graph.declarations.size,
    groupCount: state.graph.groups.size,
  };
}
