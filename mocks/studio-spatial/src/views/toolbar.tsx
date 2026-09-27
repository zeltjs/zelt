import type { EventSink } from '../events.types';
import type { ToolbarModel } from '../presenter.types';
import { useBoundary } from './use-boundary';

export function StudioToolbar({
  model,
  emit,
}: {
  readonly model: ToolbarModel;
  readonly emit: EventSink;
}) {
  const send = useBoundary(emit);
  return (
    <>
      <header className="app-header">
        <a className="brand" href="./">
          <b>z</b> zelt <span>studio</span>
        </a>
        <div className="project">
          <strong>{model.projectName}</strong>
          <span>WHOLE APPLICATION · MOCK</span>
        </div>
        <SearchBox model={model} emit={send} />
        <button
          type="button"
          data-action="help"
          onClick={() => send({ type: 'help.set', open: true })}
        >
          図の読み方
        </button>
        <button type="button" data-action="reset" onClick={() => send({ type: 'view.reset' })}>
          リセット
        </button>
      </header>
      <section className="origin-bar" aria-label="地図の対象">
        <div className="origin-title">
          <h1>{model.projectName} 全体</h1>
          <span>固定配置 · 宣言と関係</span>
        </div>
      </section>
    </>
  );
}

function SearchBox({ model, emit }: { readonly model: ToolbarModel; readonly emit: EventSink }) {
  const send = useBoundary(emit);
  return (
    <div className="search-wrap">
      <label className="sr-only" htmlFor="search">
        宣言・ファイルを検索
      </label>
      <input
        id="search"
        type="search"
        placeholder="関数・class・configを検索…"
        autoComplete="off"
        value={model.query}
        onChange={(e) => send({ type: 'search.change', query: e.currentTarget.value })}
        onKeyDown={(e) => {
          if (e.key === 'Escape') send({ type: 'search.change', query: '' });
        }}
      />
      <div id="search-results" hidden={!model.query}>
        <p>{model.searchCount}件 · 宣言とファイルを検索</p>
        {model.results.map((result) => (
          <button
            key={result.id}
            type="button"
            data-find={result.id}
            onClick={() => send({ type: 'subject.find', id: result.id })}
          >
            <strong>{result.label}</strong>
            <small>{result.hint}</small>
          </button>
        ))}
        {model.searchCount > 40 && <p>先頭40件。検索語を追加してください。</p>}
      </div>
    </div>
  );
}
