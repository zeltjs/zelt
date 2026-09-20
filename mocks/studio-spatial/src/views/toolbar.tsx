import type { EventSink } from '../events.types';
import type { ToolbarModel } from '../presenter.types';
import type { EntryKind } from '../state.types';
import { useBoundary } from './use-boundary';

const categories: readonly { readonly value: EntryKind; readonly label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'http', label: 'HTTP entry' },
  { value: 'event', label: 'Event entry' },
  { value: 'middleware', label: 'Middleware' },
  { value: 'lifecycle', label: '構成・Lifecycle' },
];
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
        <button
          type="button"
          id="composition-button"
          onClick={() => send({ type: 'composition.open' })}
        >
          アプリ構成
        </button>
        <button type="button" data-action="reset" onClick={() => send({ type: 'view.reset' })}>
          リセット
        </button>
      </header>
      <OriginPicker model={model} emit={send} />
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
            <strong>{result.id}</strong>
            <small>{result.hint}</small>
          </button>
        ))}
        {model.searchCount > 40 && <p>先頭40件。検索語を追加してください。</p>}
      </div>
    </div>
  );
}

function OriginPicker({ model, emit }: { readonly model: ToolbarModel; readonly emit: EventSink }) {
  const send = useBoundary(emit);
  return (
    <section className="origin-bar" aria-label="依存を辿る起点">
      <div className="origin-title">
        <h1>{model.projectName} 全体</h1>
        <span>固定配置 · 宣言と関係</span>
      </div>
      <EntryFilter value={model.category} emit={send} />
      <label className="root-picker">
        起点ショートカット（再帰＋ロック）
        <select
          id="root-select"
          value={model.origin}
          onChange={(e) => send({ type: 'entry.choose', id: e.currentTarget.value })}
        >
          <option value="" disabled>
            起点を選ぶ → 再帰＋ロック
          </option>
          {model.entries.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

function EntryFilter({ value, emit }: { readonly value: EntryKind; readonly emit: EventSink }) {
  const send = useBoundary(emit);
  return (
    <label>
      起点の種類
      <select
        id="category"
        value={value}
        onChange={(e) => {
          const category = categories.find((c) => c.value === e.currentTarget.value);
          if (!category) throw new Error('Unknown category option');
          send({ type: 'entry.filter', kind: category.value });
        }}
      >
        {categories.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}
