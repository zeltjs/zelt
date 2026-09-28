import type { EndpointModel, InspectorModel } from '../display.types';
import type { EventSink } from '../events.types';
import { useBoundary } from './use-boundary';

export function UnitTestTable({
  model,
  emit,
}: {
  readonly model: InspectorModel['unit'];
  readonly emit: EventSink;
}) {
  const send = useBoundary(emit);
  return (
    <section aria-label="Unit tests">
      <h3>
        Unit tests <small>{model.rows.length || ''}</small>
      </h3>
      {model.rows.length > 0 && (
        <section className="test-table-scroll" aria-label="Unit test一覧">
          <table className="test-table">
            <thead>
              <tr>
                <th scope="col">test名</th>
                {model.showTarget && <th scope="col">対象</th>}
                <th scope="col">分類</th>
                <th scope="col">mock対象</th>
              </tr>
            </thead>
            <UnitRows rows={model.rows} showTarget={model.showTarget} emit={send} />
          </table>
        </section>
      )}
      <p className="test-coverage">{model.coverage}</p>
    </section>
  );
}

export function EndpointTestTable({ model }: { readonly model: EndpointModel }) {
  return (
    <section className="endpoint-tests">
      <h4>{model.label}</h4>
      {model.rows.length > 0 && (
        <section className="test-table-scroll" aria-label="関連E2E一覧">
          <table className="test-table">
            <thead>
              <tr>
                <th scope="col">test名</th>
                <th scope="col">suite</th>
                <th scope="col">出典</th>
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row) => (
                <tr className="e2e-test" key={row.id}>
                  <td title={row.title}>{row.name}</td>
                  <td className="test-suite">{row.suite}</td>
                  <td className="test-source">{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="test-coverage">{model.coverage}</p>
    </section>
  );
}

function UnitRows({
  rows,
  showTarget,
  emit,
}: {
  readonly rows: InspectorModel['unit']['rows'];
  readonly showTarget: boolean;
  readonly emit: EventSink;
}) {
  const send = useBoundary(emit);
  return (
    <tbody>
      {rows.map((row) => (
        <tr className="unit-test" key={row.key}>
          <td title={row.title}>{row.name}</td>
          {showTarget && (
            <td>
              <button
                type="button"
                className="text-link"
                data-select={row.target}
                onClick={() => send({ type: 'subject.select', id: row.target })}
              >
                {row.targetLabel}
              </button>
            </td>
          )}
          <td className="test-style">{row.style}</td>
          <td className="test-mocks">{row.mocks}</td>
        </tr>
      ))}
    </tbody>
  );
}
