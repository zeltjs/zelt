import type { DialogModel, InspectorModel } from './display.types';
import type { Graph } from './graph.lib';
import { required, subject } from './graph.lib';
import { declarationLabels, relationLabels } from './labels';
import type { ReadyState } from './state.types';
import { endpointModels, unitCoverage, unitRows } from './test-presenter.lib';

export function presentInspector(graph: Graph, id: string | null): InspectorModel | null {
  if (id === null) return null;
  const selected = subject(graph, id),
    owner = required(graph.owners, id);
  const group = graph.groups.get(id),
    declaration = graph.declarations.get(id);
  const declarations = group ? group.members : [required(graph.declarations, id)];
  return {
    id,
    kind: declaration ? declarationLabels[declaration.kind] : owner.kind.toUpperCase(),
    path: `${selected.source.location.filePath}:${selected.source.location.startLine}`,
    source: selected.source,
    members: group
      ? group.members.map((m) => ({ id: m.id, label: `${declarationLabels[m.kind]} · ${m.name}` }))
      : [],
    unit: {
      rows: unitRows(declarations),
      showTarget: group !== undefined,
      coverage: unitCoverage(declarations),
    },
    endpoints: endpointModels(declarations),
    canUseAsRoot: owner.presentation.role !== 'composition',
    locateLabel: owner.presentation.role === 'composition' ? 'アプリ構成を見る' : '地図の位置へ ↗',
    sourceNotice: group
      ? '囲みの宣言ヘッダーです。本文は各メンバーを選んで確認してください。FILEの場合はファイルの所在を表示します。'
      : null,
  };
}

export function presentDialog(state: ReadyState): DialogModel | null {
  const dialog = state.dialog;
  if (dialog === null) return null;
  const composition = dialog.kind === 'composition';
  const edges = state.graph.relations.filter((e) =>
    composition
      ? required(state.graph.owners, e.from).presentation.role === 'composition'
      : dialog.relationIds.includes(e.id),
  );
  return {
    title: composition ? 'アプリ構成 · app.ts' : `設定との関係: ${dialog.groupId}`,
    description: composition
      ? 'createEcAppが登録する構成です。通常の地図には表示しません。'
      : '箱を非表示にしているだけで、関係は残っています。',
    compositionSource: composition,
    rows: edges.map((e) => ({ id: e.id, from: e.from, to: e.to, label: relationLabels[e.kind] })),
  };
}
