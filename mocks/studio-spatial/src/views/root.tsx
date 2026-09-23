import type { EventSink } from '../events.types';
import type { RootModel } from '../presenter.types';
import { HelpDialog, ReferenceDialog } from './dialogs';
import { GraphViewport } from './graph-viewport';
import { InspectorPanel } from './inspector';
import { StudioToolbar } from './toolbar';
import { useBoundary } from './use-boundary';

export function Root({ model, emit }: { readonly model: RootModel; readonly emit: EventSink }) {
  const send = useBoundary(emit);
  if (model.phase === 'loading') return <main role="status">構造データを読み込んでいます…</main>;
  if (model.phase === 'error')
    return (
      <main>
        <h1>構造データを表示できません</h1>
        <pre role="alert">{model.message}</pre>
        <a href="./">再読み込み</a>
      </main>
    );
  return (
    <>
      <StudioToolbar model={model.toolbar} emit={send} />
      <main>
        {model.notice !== null && (
          <p role="alert" className="warning">
            {model.notice}
          </p>
        )}
        <GraphViewport
          model={model.graph}
          controls={model.controls}
          command={model.command}
          emit={send}
        />
        <DetailToolbar />
        <InspectorPanel model={model.inspector} tab={model.tab} emit={send} />
        <footer className="page-footer">
          {model.declarationCount}宣言 / {model.groupCount} group · 静的JSON fixture · 抽出器なし ·
          設定値非表示 · 実コードやDBは変更しません
        </footer>
      </main>
      {model.help && <HelpDialog emit={send} />}
      {model.dialog !== null && <ReferenceDialog model={model.dialog} emit={send} />}
    </>
  );
}

function DetailToolbar() {
  return (
    <div className="detail-toolbar">
      <span>列・並び順を維持 · groupの＋/−で展開・折りたたみ · 同じ宣言を共有</span>
    </div>
  );
}
