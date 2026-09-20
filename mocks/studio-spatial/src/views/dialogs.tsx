import { useEffect, useRef } from 'react';
import type { DialogModel } from '../display.types';
import type { EventSink } from '../events.types';
import { useBoundary } from './use-boundary';

function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return ref;
}

export function ReferenceDialog({
  model,
  emit,
}: {
  readonly model: DialogModel;
  readonly emit: EventSink;
}) {
  const send = useBoundary(emit),
    ref = useModal();
  return (
    <dialog
      ref={ref}
      id="reference-dialog"
      aria-labelledby="reference-title"
      onCancel={(e) => {
        e.preventDefault();
        send({ type: 'dialog.close' });
      }}
    >
      <div className="dialog-title">
        <h2 id="reference-title">{model.title}</h2>
        <button
          type="button"
          id="close-reference"
          aria-label="閉じる"
          onClick={() => send({ type: 'dialog.close' })}
        >
          ×
        </button>
      </div>
      <div id="reference-content">
        <p>{model.description}</p>
        <ReferenceRows rows={model.rows} emit={send} />
        {model.compositionSource && (
          <button
            type="button"
            data-composition-source
            onClick={() => send({ type: 'composition.source' })}
          >
            createEcAppの実コードを見る
          </button>
        )}
      </div>
    </dialog>
  );
}

export function HelpDialog({ emit }: { readonly emit: EventSink }) {
  const send = useBoundary(emit),
    ref = useModal();
  return (
    <dialog
      ref={ref}
      id="help-dialog"
      aria-labelledby="help-title"
      onCancel={(e) => {
        e.preventDefault();
        send({ type: 'help.set', open: false });
      }}
    >
      <div className="dialog-title">
        <h2 id="help-title">何を表示しているか</h2>
        <button
          type="button"
          aria-label="閉じる"
          onClick={() => send({ type: 'help.set', open: false })}
        >
          ×
        </button>
      </div>
      <HelpText />
      <button type="button" onClick={() => send({ type: 'help.set', open: false })}>
        地図に戻る
      </button>
    </dialog>
  );
}

function ReferenceRows({
  rows,
  emit,
}: {
  readonly rows: DialogModel['rows'];
  readonly emit: EventSink;
}) {
  const send = useBoundary(emit);
  return (
    <ul className="relations">
      {rows.map((row) => (
        <li key={row.id}>
          <span className="relation-kind">{row.label}</span>
          <button
            type="button"
            className="text-link"
            data-reference-jump={row.from}
            onClick={() => send({ type: 'reference.jump', id: row.from })}
          >
            {row.from}
          </button>{' '}
          →{' '}
          <button
            type="button"
            className="text-link"
            data-reference-jump={row.to}
            onClick={() => send({ type: 'reference.jump', id: row.to })}
          >
            {row.to}
          </button>
        </li>
      ))}
    </ul>
  );
}

function HelpText() {
  return (
    <>
      {' '}
      <p>
        CLASS・FILE・INTERFACEは実在する宣言元です。最初は折りたたみ、＋で1宣言1nodeへ展開します。閉じたメンバーの線はgroupにつなぎ、同じ向き・同じ種類だけを束ねます。
      </p>
      <p>
        列と並び順を維持し、折りたたみ分だけ縦の空間を詰めます。タグ用の領域は固定で予約します。閉じた箱と付属タグの濃淡は同じです。展開時は宣言の関係に沿います。
      </p>
      <p>
        近傍は使う先と使われる元の1段。再帰はuseとused
        byを起点から別々に辿り、途中で方向を切り替えません。ロックすると矢印とactive範囲を保ったまま詳細を選べます。
      </p>
      <p>
        middleware適用はタグ、event配送・別entryへの呼出はwarpです。探索範囲を勝手に広げません。参照先へ移動してもロックは維持し、「移動前に戻る」で元の表示へ戻れます。
      </p>
      <p>
        configの箱と線は表示切替でき、非表示でも関係のタグは残ります。app.tsはアプリ構成から確認できます。設定値は配信前に除いています。
      </p>
      <p>
        Unit testは対象宣言の一覧です。分類とmock対象はZeltのDI
        setupに基づき、ライブラリimportから推測しません。HTTP
        entryのE2Eはrequestとの対応であり、method実行の保証ではありません。
      </p>
      <p>
        手動fixtureです。内部未展開は依存なしを意味しません。抽出器・実行時トレース・test
        runner連携は未実装です。
      </p>
    </>
  );
}
