import type { EventSink } from '../events.types';
import type { ControlsModel } from '../presenter.types';
import type { ScopeMode, ViewOptions } from '../state.types';
import { useBoundary } from './use-boundary';

const modes: readonly { readonly mode: ScopeMode; readonly label: string }[] = [
  { mode: 'near', label: '近傍（1段）' },
  { mode: 'flow', label: '再帰（use / used by）' },
  { mode: 'all', label: '全関係' },
];
const options: readonly {
  readonly key: keyof ViewOptions;
  readonly id: string;
  readonly label: string;
}[] = [
  { key: 'showTypes', id: 'show-type-arrows', label: '型の参照arrow' },
  { key: 'showCounts', id: 'show-edge-counts', label: '数字表示（×N）' },
  { key: 'showConfig', id: 'show-config', label: 'config' },
];
export function MapControls({
  model,
  zoom,
  lineCount,
  emit,
}: {
  readonly model: ControlsModel;
  readonly zoom: number;
  readonly lineCount: string;
  readonly emit: EventSink;
}) {
  const send = useBoundary(emit);
  return (
    <div className="map-toolbar">
      <ScopeModes mode={model.mode} emit={send} />
      <button
        type="button"
        id="scope-lock"
        aria-pressed={model.locked}
        disabled={!model.canLock}
        onClick={() => send({ type: 'scope.lock', locked: !model.locked })}
      >
        {model.locked ? 'ロック中 · 解除' : '範囲をロック'}
      </button>
      <span id="scope-status" role="status">
        {model.scopeStatus}
      </span>
      <span id="line-count">{lineCount}</span>
      <DisplayOptions value={model.options} emit={send} />
      {model.canBack && (
        <button type="button" id="reference-back" onClick={() => send({ type: 'reference.back' })}>
          ↩ 移動前に戻る
        </button>
      )}
      <GroupControls emit={send} />
      <ZoomControls zoom={zoom} emit={send} />
    </div>
  );
}

function DisplayOptions({
  value,
  emit,
}: {
  readonly value: ViewOptions;
  readonly emit: EventSink;
}) {
  const send = useBoundary(emit);
  return (
    <fieldset className="display-options" aria-label="表示オプション">
      <span>表示</span>
      {options.map((option) => (
        <label key={option.key}>
          <input
            type="checkbox"
            id={option.id}
            checked={value[option.key]}
            onChange={(e) =>
              send({
                type: 'options.change',
                options: { ...value, [option.key]: e.currentTarget.checked },
              })
            }
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

function ZoomControls({ zoom, emit }: { readonly zoom: number; readonly emit: EventSink }) {
  const send = useBoundary(emit);
  return (
    <div className="zoom-controls">
      <button
        type="button"
        aria-label="縮小"
        onClick={() => send({ type: 'viewport.zoom', value: zoom - 0.1 })}
      >
        −
      </button>
      <output id="zoom-level">{Math.round(zoom * 100)}%</output>
      <button
        type="button"
        aria-label="拡大"
        onClick={() => send({ type: 'viewport.zoom', value: zoom + 0.1 })}
      >
        ＋
      </button>
      <button type="button" onClick={() => send({ type: 'viewport.zoom', value: 1 })}>
        100%
      </button>
      <button type="button" onClick={() => send({ type: 'viewport.zoom', value: 'fit' })}>
        横幅に合わせる
      </button>
    </div>
  );
}

function GroupControls({ emit }: { readonly emit: EventSink }) {
  const send = useBoundary(emit);
  return (
    <fieldset className="collapse-controls" aria-label="groupの表示粒度">
      <button
        type="button"
        data-action="expand-all"
        onClick={() => send({ type: 'groups.expand', expanded: true })}
      >
        全groupを展開
      </button>
      <button
        type="button"
        data-action="collapse-all"
        onClick={() => send({ type: 'groups.expand', expanded: false })}
      >
        全groupを閉じる
      </button>
    </fieldset>
  );
}

function ScopeModes({ mode, emit }: { readonly mode: ScopeMode; readonly emit: EventSink }) {
  const send = useBoundary(emit);
  return (
    <fieldset className="mode-buttons" aria-label="表示する関係">
      {modes.map((m) => (
        <button
          type="button"
          key={m.mode}
          data-mode={m.mode}
          aria-pressed={mode === m.mode}
          onClick={() => send({ type: 'scope.mode', mode: m.mode })}
        >
          {m.label}
        </button>
      ))}
    </fieldset>
  );
}
