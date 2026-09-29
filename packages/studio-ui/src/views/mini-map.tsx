import type { GroupModel } from '../display.types';
import type { EventSink } from '../events.types';
import type { Rect } from '../state.types';
import { useBoundary } from './use-boundary';

export function MiniMap({
  groups,
  width,
  height,
  viewport,
  emit,
}: {
  readonly groups: readonly GroupModel[];
  readonly width: number;
  readonly height: number;
  readonly viewport: Rect;
  readonly emit: EventSink;
}) {
  const send = useBoundary(emit);
  return (
    <aside className="overview">
      <span>全体の位置</span>
      <div id="mini-map">
        <svg viewBox={`0 0 ${width} ${height}`} aria-label="全体の位置">
          {groups.map((g) => (
            <MiniNode key={g.id} group={g} emit={send} />
          ))}
          <rect
            id="mini-viewport"
            x={viewport.x}
            y={viewport.y}
            width={viewport.width}
            height={viewport.height}
            fill="none"
            stroke="#d58238"
            strokeWidth="18"
          />
        </svg>
      </div>
      <small>箱を押して移動</small>
    </aside>
  );
}

function MiniNode({ group: g, emit }: { readonly group: GroupModel; readonly emit: EventSink }) {
  const send = useBoundary(emit);
  return (
    <foreignObject
      data-mini={g.id}
      x={g.rect.x}
      y={g.rect.y}
      width={g.rect.width}
      height={g.rect.height}
    >
      <button
        type="button"
        className="mini-node"
        aria-label={g.name}
        title={g.name}
        onClick={() => send({ type: 'subject.find', id: g.id })}
      />
    </foreignObject>
  );
}
