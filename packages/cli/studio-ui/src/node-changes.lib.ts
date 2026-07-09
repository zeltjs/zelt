import type { NodeChange } from '@xyflow/react';
import { applyNodeChanges } from '@xyflow/react';

import type { FlowNode } from './graph-to-flow.lib';

// dimensions change を捨てるとユーザーノードが measured を持てず、adoptUserNodes が
// 内部の計測情報を破棄してドラッグ中のノードが visibility: hidden になる。
// そのため remove（グラフはビューアであり削除は扱わない）以外は applyNodeChanges に委譲する。
export const applyStudioNodeChanges = (
  nodes: FlowNode[],
  changes: NodeChange<FlowNode>[],
): FlowNode[] =>
  applyNodeChanges(
    changes.filter((change) => change.type !== 'remove'),
    nodes,
  );
