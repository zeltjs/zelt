import type { MapModel, ViewportCommand } from '../display.types';
import type { EventSink } from '../events.types';
import type { ControlsModel } from '../presenter.types';
import { EdgeLayer } from './edge-layer';
import { GroupNode } from './group-node';
import { MapControls } from './map-controls';
import { MiniMap } from './mini-map';
import { useBoundary } from './use-boundary';
import { useViewport } from './use-viewport';

export function GraphViewport({
  model,
  controls,
  command,
  emit,
}: {
  readonly model: MapModel;
  readonly controls: ControlsModel;
  readonly command: ViewportCommand | null;
  readonly emit: EventSink;
}) {
  const viewport = useViewport(model.width, command, emit);
  const send = useBoundary(emit, viewport.handle);
  return (
    <section className="map-section" aria-label="固定配置の依存地図">
      <MapControls model={controls} zoom={viewport.zoom} lineCount={model.lineCount} emit={send} />
      <div className="map-shell">
        <section
          id="map-scroll"
          ref={viewport.element}
          onScroll={viewport.measure}
          aria-label="依存地図。縦横スクロールで移動"
        >
          <GraphScene model={model} zoom={viewport.zoom} emit={send} />
        </section>
        <MiniMap
          groups={model.groups}
          width={model.width}
          height={model.height}
          viewport={viewport.viewport}
          emit={send}
        />
      </div>
      <MapLegend summary={model.summary} />
    </section>
  );
}

function GraphScene({
  model,
  zoom,
  emit,
}: {
  readonly model: MapModel;
  readonly zoom: number;
  readonly emit: EventSink;
}) {
  const send = useBoundary(emit);
  return (
    <div id="map-space" style={{ width: model.width * zoom, height: model.height * zoom }}>
      <div
        id="architecture-map"
        style={{
          width: model.width,
          height: model.height,
          transform: `scale(${zoom})`,
        }}
      >
        <div id="column-headings">
          {model.columns.map((c) => (
            <span key={c.label} style={{ position: 'absolute', left: c.x, width: c.width }}>
              {c.label}
            </span>
          ))}
        </div>
        <EdgeLayer edges={model.edges} width={model.width} height={model.height} />
        <div id="class-groups">
          {model.groups.map((group) => (
            <GroupNode key={group.id} model={group} emit={send} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MapLegend({ summary }: { readonly summary: string }) {
  return (
    <footer className="map-footer">
      <span id="selection-summary">{summary}</span>
      <div className="legend">
        <span className="call-key">→ 呼ぶ</span>
        <span className="read-key">─○ 読む</span>
        <span className="middleware-key">タグ: 適用</span>
        <span className="event-key">↗ warp: event</span>
        <span>·· 型・登録・継承</span>
      </div>
    </footer>
  );
}
