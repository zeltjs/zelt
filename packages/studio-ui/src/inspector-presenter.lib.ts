import type { SetupItem } from '@zeltjs/studio-extract/snapshot';
import type { InspectorModel, SetupRow } from './display.types';
import type { Graph } from './graph.lib';
import { required, subject } from './graph.lib';
import { declarationLabel, setupLabel } from './labels';
import { sourceOrderedMembers } from './layout.lib';
import { endpointModels, unitCoverage, unitRows } from './test-presenter.lib';

/** @throws {Error} */
function setupRows(
  graph: Graph,
  owner: string | null,
  items: readonly SetupItem[],
): readonly SetupRow[] {
  return items.map((item) => ({
    key: JSON.stringify([owner, item.provider, item.kind, item.label, item.target]),
    owner,
    kind: setupLabel(item),
    provider: item.provider,
    label: item.label,
    target:
      item.target === null ? null : { id: item.target, name: subject(graph, item.target).name },
  }));
}

/** @throws {Error} */
export function presentInspector(graph: Graph, id: string | null): InspectorModel | null {
  if (id === null) return null;
  const selected = subject(graph, id),
    owner = required(graph.owners, id);
  const group = graph.groups.get(id),
    declaration = graph.declarations.get(id);
  const declarations = group ? sourceOrderedMembers(group) : [required(graph.declarations, id)];
  return {
    id,
    name: selected.name,
    kind: declaration ? declarationLabel(declaration) : owner.kind.toUpperCase(),
    path: `${selected.source.location.filePath}:${selected.source.location.startLine}`,
    source: selected.source,
    members: group
      ? declarations.map((m) => ({ id: m.id, label: `${declarationLabel(m)} · ${m.name}` }))
      : [],
    unit: {
      rows: unitRows(declarations),
      showTarget: group !== undefined,
      coverage: unitCoverage(declarations),
    },
    endpoints: endpointModels(declarations),
    setup: group
      ? [
          ...setupRows(graph, null, group.setup),
          ...declarations.flatMap((m) => setupRows(graph, m.name, m.setup)),
        ]
      : setupRows(graph, null, selected.setup),
    sourceNotice: group
      ? '囲みの宣言ヘッダーです。本文は各メンバーを選んで確認してください。FILEの場合はファイルの所在を表示します。'
      : null,
  };
}
