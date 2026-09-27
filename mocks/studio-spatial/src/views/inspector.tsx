import { useRef } from 'react';
import type { InspectorModel } from '../display.types';
import type { EventSink } from '../events.types';
import type { InspectorTab } from '../state.types';
import { EndpointTestTable, UnitTestTable } from './test-tables';
import { useBoundary } from './use-boundary';

export function SourcePanel({ model }: { readonly model: InspectorModel }) {
  return (
    <>
      {model.sourceNotice && <p className="muted">{model.sourceNotice}</p>}
      <pre className="source-code">
        {model.source.excerpt.kind === 'declaration-only'
          ? model.source.signature
          : model.source.excerpt.text}
      </pre>
    </>
  );
}

export function ContractPanel({
  model,
  emit,
}: {
  readonly model: InspectorModel;
  readonly emit: EventSink;
}) {
  const send = useBoundary(emit);
  return (
    <div className="contract-grid">
      <section>
        <h3>宣言の契約</h3>
        <pre>{model.source.signature}</pre>
        <SetupList rows={model.setup} emit={send} />
        {model.members.length > 0 && (
          <>
            <h3>メンバー</h3>
            <div className="member-links">
              {model.members.map((member) => (
                <button
                  type="button"
                  key={member.id}
                  className="text-link"
                  data-select={member.id}
                  onClick={() => send({ type: 'subject.select', id: member.id })}
                >
                  {member.label}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
      <div className="contract-tests">
        <UnitTestTable model={model.unit} emit={send} />
        {model.endpoints.length > 0 && (
          <section aria-label="Endpointの関連E2E">
            <h3>Endpointの関連E2E</h3>
            {model.endpoints.map((endpoint) => (
              <EndpointTestTable key={endpoint.id} model={endpoint} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function SetupList({
  rows,
  emit,
}: {
  readonly rows: InspectorModel['setup'];
  readonly emit: EventSink;
}) {
  const send = useBoundary(emit);
  if (rows.length === 0) return null;
  return (
    <section aria-label="Setup">
      <h3>Setup</h3>
      <ul className="relations setup-list">
        {rows.map((row) => (
          <li key={row.key} className="setup-item">
            <span className="relation-kind">
              {row.owner !== null && `${row.owner} · `}
              {row.kind} · {row.provider}
            </span>
            <code>{row.label}</code>
            {row.target !== null && <SetupTarget target={row.target} emit={send} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SetupTarget({
  target,
  emit,
}: {
  readonly target: { readonly id: string; readonly name: string };
  readonly emit: EventSink;
}) {
  const send = useBoundary(emit);
  return (
    <button
      type="button"
      className="text-link"
      data-select={target.id}
      onClick={() => send({ type: 'subject.select', id: target.id })}
    >
      → {target.name}
    </button>
  );
}

const tabs: readonly { readonly tab: InspectorTab; readonly label: string }[] = [
  { tab: 'contract', label: '契約' },
  { tab: 'source', label: '実コード' },
];
export function InspectorPanel({
  model,
  tab,
  emit,
}: {
  readonly model: InspectorModel | null;
  readonly tab: InspectorTab;
  readonly emit: EventSink;
}) {
  const send = useBoundary(emit);
  if (model === null)
    return (
      <section id="inspector" aria-label="選択した宣言の契約・実コード">
        <div className="welcome">
          <span className="eyebrow">EC-BACKEND / WHOLE APPLICATION</span>
          <h2>入口を選び、依存を辿る</h2>
          <p>
            箱の選択に範囲が追従します。ロックすると矢印・active範囲を保って詳細を読めます。詳細の「ここから再帰＋ロック」で起点を固定できます。
          </p>
          <p>
            列は表示切替でき、非表示の列は箱も線もタグも表示しません。右の小地図から全体の各位置へ移動できます。
          </p>
        </div>
      </section>
    );
  return (
    <section id="inspector" aria-label="選択した宣言の契約・実コード">
      <InspectorHeading model={model} emit={send} />
      <InspectorTabs tab={tab} emit={send} />
      <div className="inspector-body" role="tabpanel">
        {tab === 'source' ? (
          <SourcePanel model={model} />
        ) : (
          <ContractPanel model={model} emit={send} />
        )}
      </div>
    </section>
  );
}

function InspectorHeading({
  model,
  emit,
}: {
  readonly model: InspectorModel;
  readonly emit: EventSink;
}) {
  const send = useBoundary(emit);
  return (
    <header className="inspector-heading">
      <div>
        <span className="eyebrow">{model.kind}</span>
        <h2>{model.name}</h2>
        <p className="source-path">{model.path}</p>
      </div>
      <div className="inspector-actions">
        <button
          type="button"
          data-action="locate"
          onClick={() => send({ type: 'subject.locate', id: model.id })}
        >
          地図の位置へ ↗
        </button>
        <button
          type="button"
          data-action="as-root"
          onClick={() => send({ type: 'scope.start', id: model.id })}
        >
          ここから再帰＋ロック
        </button>
      </div>
    </header>
  );
}

function InspectorTabs({ tab, emit }: { readonly tab: InspectorTab; readonly emit: EventSink }) {
  const send = useBoundary(emit);
  const tablist = useRef<HTMLDivElement>(null);
  return (
    <div className="inspector-tabs" role="tablist" aria-label="宣言の詳細" ref={tablist}>
      {tabs.map((t) => (
        <button
          key={t.tab}
          type="button"
          role="tab"
          data-tab={t.tab}
          aria-selected={tab === t.tab}
          tabIndex={tab === t.tab ? 0 : -1}
          onClick={() => send({ type: 'inspector.tab', tab: t.tab })}
          onKeyDown={(e) => {
            if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault();
            const next =
              e.key === 'Home'
                ? 'contract'
                : e.key === 'End'
                  ? 'source'
                  : tab === 'source'
                    ? 'contract'
                    : 'source';
            send({ type: 'inspector.tab', tab: next });
            tablist.current?.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
