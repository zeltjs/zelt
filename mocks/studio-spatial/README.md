# ec-backend / Studio mock

抽出器・API接続・ビルド不要の静的UIモック。`index.html` を直接開くか、このディレクトリで
`python3 -m http.server 4411 --bind 127.0.0.1` を実行する。

## 評価する体験

注文だけの抜粋からec-backend全体へ広げても、入口・共有依存・契約を実コードに照合できるか。
HTTP / eventのentryとmiddlewareを起点にする。configは別タブに隔離しない。
層の列と箱の並び順を保ち、groupの折りたたみと選択近傍／起点の依存範囲で読めるかを試す。
読みやすさはユーザーによる評価待ちで、自動テストの成功とは別。

## 操作

- CLASS・FILE・INTERFACEの全groupは初期折りたたみ。各箱の「＋ / −」で個別展開でき、「全groupを展開」で従来表示へ戻せる。
- 閉じたgroupの関数・property・型などにつながる線はgroupに接続。同方向・同種の線だけを束ね、件数を表示する。
- group内だけの関係は折りたたみ中は内部件数として表示。詳細の関係一覧には元の宣言名・根拠が残る。
- groupの種類表示は維持する。宣言の検索・起点・詳細リンクからの選択では所属groupだけを自動展開する。
- 起点: 全16 HTTP entry、event受信callback、5 middleware、構成・lifecycleから選ぶ。
- 選択近傍: 選んだ宣言が使う先と使う元の線だけを表示する。
- 起点の依存範囲: 呼出・参照を辿る。同じclassのconstructorと設定overrideを文脈として含める。
- 適用middlewareも辿る: HTTPから登録済みmiddlewareを含めるか切り替える。
- 全関係: 全256関係が対象。閉じたgroupの線は束ね、内部関係は件数で表示。初期画面は線なしの全体配置。
- 検索: 関数・class・property・型・ファイル名を探し、選ぶと地図の位置へ移動する。
- 全体の小地図: class/file/interfaceをクリックして移動する。地図は縦横スクロール可能。
- 倍率: 横幅に合わせる / 100% / 拡大・縮小。宣言の座標は変えない。
- 詳細: 契約・使う元／先、実コード、範囲・境界の影響。関係先をクリックして辿れる。
- ここから辿る: entry以外の任意の宣言も調査の起点にできる。
- Order型の仮変更: statusにrefundedを加える仮定で、直接型参照3メソッドとその呼出元3メソッドを強調する。
  完全な変更影響解析ではない。実コード・DBは変更しない。

## 表示オプションの契約

目的: 型参照と矢印の件数を独立に省き、地図の読みやすさを比較する。
事前条件: fixtureの関係種別が型参照と実行時参照を区別している。

事後条件:

- 地図上部に「型の参照arrow」「数字表示（×N）」のcheckboxを置く。初期・リセットは両方ON。
- 型OFFでは型注釈・型定義の参照線のみ隠す。呼出・読み取り・テーブル・入力検証schema・middleware・event配送等の線は残す。
- 数字OFFでは矢印の束に付く×Nだけ隠す。矢印・元の関係・ホバーの内訳は維持し、集計・内部件数・倍率・ソース行番号は対象外。
- 選択近傍・依存範囲・全関係、および開閉状態の組み合わせで適用する。OFF→ONで元に戻る。
- 選択・起点・タブ・開閉を操作しても設定を維持する。再読込では初期状態へ戻る。

不変条件: 表示切替で元グラフ・依存範囲の計算・箱の配置と強調・開閉・選択ID・起点・詳細タブと関係一覧は変えない。
既存fixtureの実行時request(schema)参照6本はtypeからschemaへ分類を訂正する。型定義からschema/tableへの参照はtypeのまま。
新しい業務上の箱・抽出器・実コード変更なし。契約外の外部影響: なし。

## 折りたたみの契約

目的: 全体をgroup単位で見渡し、必要な箱だけ宣言単位へ掘り下げられるかを試す。
仮定: 表示密度を下げつつ、隠れた宣言の入出力をgroupへ投影すれば関係を見失わないか。

事前条件: 宣言の所属group・関係の端点が既存fixture内で解決できる。

事後条件:

- 初期状態とリセットではCLASS・FILE・INTERFACEの全groupを閉じる。全groupに個別開閉ボタンを表示し、一括開閉も同じ対象に適用する。
- 個別の開閉では他groupの開閉状態、起点・選択ID・詳細タブを維持する。
- 隠れたメンバーの端点だけをgroupに投影する。片側展開ならgroup→宣言 / 宣言→group、両側展開なら元の端点となる。
- 同一の表示始点・終点・関係種別のみ束ねる。反対向き・別種別は混ぜない。元の関係IDを全て保持する。
- 閉じたgroup内の関係は自己ループを作らず内部件数にする。元の関係は詳細と再展開で確認できる。
- 選択近傍・起点の依存範囲は元グラフで計算してから投影する。閉じたgroupの別の宣言へ範囲を広げない。
- group選択は展開しない。メンバー選択・「地図の位置へ」は所属groupだけを開いて位置へ移動できる。
- 層・列・縦の並び順を維持し、閉じたメンバーの高さ分だけ同列の後続箱を詰める。全展開で旧座標へ戻る。
- 開閉後も箱が重ならず、線の端点・小地図・スクロール範囲が表示座標と一致する。
- 個別開閉ボタンはキーボード操作とaria-expandedに対応し、再描画後もフォーカスを失わない。

不変条件: fixture・元の宣言ID・関係・署名・groupの種類ラベルは変更しない。仮変更の強調は閉じたgroupにも伝える。
表示だけの変更で、抽出器・実コード・DB・設定への変更や新しい業務上の箱はない。契約外の外部影響: なし。

## 実装の契約

目的: 全体を載せた状態でUIを評価する。抽出器の設計や実装は行わない。

事前条件:

- fixtureは実在する宣言・登録・呼出・参照を指す。意味で合成した関数やclassは作らない。
- 1関数宣言1node。メソッドは宣言元classに所属する。トップレベル関数はFILE、型のメンバーはINTERFACEとして区別する。
- イベント受信の無名関数は位置と登録式で識別する。startupをイベントハンドラーとは呼ばない。
- property/getter、schema/type/table、interfaceのシグネチャは関数実装nodeと区別する。
- 設定値を表示しない。getterの値やproperty initializerはソースsnapshotでも伏せる。

事後条件:

- ec-backendの全21 source file、16 HTTP entry、event購読callback、5 middlewareを確認できる。
- 全4 usecase、app構成、Domainの全5ファイル、両config、DB定義、lifecycleメソッド、ローカル補助関数を表示する。
- JwtServiceはHTTP loginとJwtMiddlewareの両方から参照される同じclass。configも同じ宣言を共有する。
- middleware適用は直接呼出と別。event発行と購読先の対応も直接呼出と別。継承・実装・型参照も種別を保つ。
- OrderHandlersの購読はstartupにあり、受信callbackは別関数。callbackを起点として選べる。
- 選択した宣言のシグネチャ・コード範囲・呼ぶ先・読む先・使う元・境界を確認できる。
- 起点の網羅はfixtureの数ではなく、アプリの登録をソースから独立に列挙して照合する。

不変条件:

- 開閉状態が同じなら起点選択・検索・選択・詳細タブで座標を変えない。IDは開閉でも変えず、同じ宣言をflowごとに複製しない。
- package側で展開を止めた宣言は「内部未展開」と明示する。未展開を依存なしと同一視しない。
- プロダクションのコード・DB・設定を書き換えない。CLIはアプリに登録がないため作らない。
- HTMLが参照するCSS・data.js・sources.js・projection.js・map-view.js・app.jsはすべて同じ版番号を使う。
- バージョン変更は6アセットのURLとdata.jsのversionを同時に更新する。

## モデル・ソースとの対応

157宣言（関数実装82、property/getter・型・schema・table・interface契約等75）、
41 class/file/interface group、256関係。groupは新しい責務の合成ではない。
constructorは実在する関数だがHTTP/event entryとは区別する。
ローカルの無名callbackはevent受信・EcJwtConfig.resolveUserの返却関数を除き、親の内部コードに残す。

`data.js` は手で範囲と関係を記述した固定fixture。
`sources.js` は指定した実宣言から複写した署名・コード・位置の固定snapshot（設定値は伏せる）。
`projection.js` は開閉状態に応じた表示座標と線の投影のみを計算する。元グラフと依存範囲は変更しない。
`map-view.js` はその表示座標をDOM・小地図へ適用し、groupの開閉を扱う。
ブラウザでソースを読み取ったり、構造を抽出したりする処理はない。

配置列は表示規約。package serviceを架空のUse caseへ分類しない。
Domainはschemaと型。OrderなどDB由来の型はsrc/infra/db/schema.tsに置く。
独自Repository Portはない。CartServiceのKVStoreは実在のinterfaceで、
MemoryKVStore implements AtomicKVStore extends KVStoreを区別する。

## 展開の境界・未検証

ec-backend/src全体と、使用packageの明示的な境界を対象にする。
ライブラリ全体を無制限に再帰展開した図ではない。
MemoryKV、MemoryEventBus、Logger、RateLimitService、LifecycleManager等は表示したメンバーの先を未展開とする。
JwtConfigは注入先の型として表示し、EcJwtConfigのoverride・appでの登録を分けて示す。
CorsConfig / SecureHeadersConfigを読むmiddlewareも含める。

ORM / SQL builder、標準API、request・response・DI・認可・例外処理等のframework内部は展開しない。
@Authorizedはframework側の認可情報であり、架空のAuthorizedMiddlewareを作らない。
middleware適用の線は登録関係。実行時の順序や完全なトレースではない。
関数を返すgetterの静的参照とoverrideは示すが、任意の高階関数の呼出先解決を保証するものではない。

契約を通らない影響:
共有DBテーブル、注文のDB transaction後のKV削除・event発行、request contextを通じた認証情報を詳細に記す。
性能、並行更新、例外の最終HTTP変換、ライブラリ内部を含む完全な影響解析は未検証。

## 検証

リポジトリルートで:

```sh
node mocks/studio-spatial/verify.mjs
node mocks/studio-spatial/verify.mjs --browser
```

TypeScript ASTで宣言・ファイル・署名・コード位置・全アプリメンバー・全HTTP登録・event登録を照合する。
注入先アクセスはfixtureの宛先で先に絞らずに列挙し、存在しない／表示していない参照を失敗にする。
自己メソッド呼出、ローカル関数、constructorの注入先への呼出も照合する。
この検証コードはfixture検査用であり、画面用データを生成する抽出器ではない。

ブラウザ検証にはPlaywrightが必要。
`PLAYWRIGHT_MODULE` と `CHROMIUM_EXECUTABLE` で既存のローカル環境を指定できる。
3画面サイズ、全起点・全宣言の詳細、entry→configとmiddleware→同じconfig、event受信への移動、
検索・ズーム・キーボード・リセット・幾何の不変条件、file/HTTPと旧版アセットが残ったキャッシュ更新を確認する。
折りたたみは84状態（全開閉、各groupのみ開閉）で投影・種別・方向・元関係の保存・非重複配置を検証する。
ブラウザで初期状態、片側/両側の展開、検索時の自動展開、選択/起点/詳細タブの保持、実DOMと線・小地図の座標を確認する。
