import { describe, expect, it } from 'vitest';

import type { FlowNode } from './graph-to-flow.lib';
import { applyStudioNodeChanges } from './node-changes.lib';

const node = (id: string): FlowNode => ({
  id,
  type: 'card',
  position: { x: 0, y: 0 },
  data: { className: id, filePath: `${id}.ts`, kind: 'controller', unresolved: false },
});

describe('applyStudioNodeChanges', () => {
  it('applies position changes while dragging', () => {
    const result = applyStudioNodeChanges(
      [node('a'), node('b')],
      [{ type: 'position', id: 'a', position: { x: 10, y: 20 }, dragging: true }],
    );
    expect(result.find((n) => n.id === 'a')?.position).toEqual({ x: 10, y: 20 });
    expect(result.find((n) => n.id === 'b')?.position).toEqual({ x: 0, y: 0 });
  });

  it('applies dimensions changes so nodes keep their measurement during drag', () => {
    // measured を落とすと adoptUserNodes が内部の計測情報を破棄し、
    // ドラッグ中のノードが visibility: hidden になる
    const result = applyStudioNodeChanges(
      [node('a')],
      [{ type: 'dimensions', id: 'a', dimensions: { width: 240, height: 80 } }],
    );
    expect(result.find((n) => n.id === 'a')?.measured).toEqual({ width: 240, height: 80 });
  });

  it('ignores remove changes', () => {
    const result = applyStudioNodeChanges([node('a')], [{ type: 'remove', id: 'a' }]);
    expect(result.map((n) => n.id)).toEqual(['a']);
  });
});
