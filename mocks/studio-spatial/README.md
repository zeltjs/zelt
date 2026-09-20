# Studio function / class mock

`index.html` をブラウザで開くと動く、抽出器・API・ビルド不要の UI モック。
HTTP 配信する場合は、このディレクトリで `python3 -m http.server 4411 --bind 127.0.0.1` を実行する。

## 評価する体験

- 注文作成と単件照会を、実メソッドと宣言元クラスの対応で読めるか。
- 箱の契約を確認したところで、内部を開かずに判断できるか。
- `Order.status` の仮変更から、両 flow の返却契約への影響を読み取れるか。
- 実コードに存在しない Domain / Repository Port を捏造せず、構造上の空白を読めるか。

## 実体との対応・操作の契約

目的は、表示をコードに照合できる状態で UI を評価すること。抽出器は作らないが、機械的に識別できる宣言・呼出を fixture にする。

事前条件:

- 各 node は実ファイルの1つのメソッド宣言を指す。識別子は class 名とメソッド名。現 fixture では class 名の重複がないことを確認する。
- group はそのメソッドを宣言する実在の class。意味的な責務を合成した group は作らない。
- 呼出辺の両端はメソッド node。呼び元の本体に当該呼出があり、レシーバーの注入先は呼出先の class と一致する。
- 読取辺は実メソッドから実在する property / getter 宣言へ向く。型・宣言元・参照式を確認し、架空の getter を作らない。

事後条件:

- 各 node を選択すると、同じメソッドのシグネチャ・呼出元／先・抜粋を表示する。
- `OrderController.detail` から `OrderService.findById` と `OrderService.getOrderItems` へ、それぞれ別の呼出辺を表示する。両メソッドを合成しない。
- class のメンバー一覧は表示 node と一致し、省略したメソッドは名前で明示する。
- `Order` は独立した型情報として表示し、関数 node にしない。仮変更で確認するメソッドは直接参照2件と返却値を利用する呼び元2件。`getOrderItems` は含めない。
- `createOrder` / `findById` / `getOrderItems` の3メソッドから `DrizzleService.db` へ「読む」辺を表示する。
- configは別の実コード表示。`JwtService.verify` → `JwtConfig.secret` の getter 読み取りと、`EcJwtConfig` の継承・override・configs 登録を区別する。設定値自体は載せない。
- 対象メソッド内の注入先へのアクセスを実コードから列挙し、fixture にないクラス・メソッド・property へのアクセスを検出する。先に表示対象で絞り込んで欠落を見逃さない。

不変条件:

- flow 選択・箱選択・タブ切替・変更シナリオで、地図の箱の位置と大きさを変えない。
- 同じメソッドを flow 別に複製しない。class group と関数 node は別の表示要素。
- 境界・内部・実コードの対応を切り替えても、上の地図と現在の対象を保つ。
- 仮変更は `refunded` の追加として明示し、元へ戻せる。実コード・DB・抽出器へ書き込まない。
- 補足説明は手入力であることを示す。説明から node の単位・名前・所属を作らない。
- 根拠のコードは手作業の抜粋。省略箇所は明示する。
- HTMLのCSS・data.js・app.jsは同じ版番号のURLを使う。変更時は3ファイルの参照版を一緒に更新する。

## 範囲と判断

注文表示は `integration/ec-backend` の注文作成・単件照会、CartService / MemoryEventBusAdaptor のメソッド、DrizzleService.db。認証表示は JwtService.verify と JwtConfig / EcJwtConfig の secret getter。
合計8クラス・9メソッド・3 property/getter 宣言・6呼出辺・4読取辺を `data.js` に手入力。
各クラスの他メソッド、コンストラクター、無名コールバック、フレームワーク・ORM・KV・mitt の関数は表示範囲外。すべての関数を網羅したグラフではない。
`DrizzleService.db` は地図上で青い property 欄として表示する。「注文の保存」という関数 node は作らない。その先の ORM 操作やテーブル参照は呼び元メソッドの内部タブに記す。

Order は DB スキーマ由来の型なので、関数地図の外に型情報として表示する。この経路には独立した Domain モデルや Repository Port がない。
`src/domain` に入力スキーマ・イベント定義があることを否定する表示ではない。
緑矢印＝呼ぶ、青丸端の線＝読む、灰色破線＝継承。`MemoryEventBusAdaptor implements EventBusAdaptor` は class 詳細で明記し、呼出辺と混ぜない。

createOrder の内部では、DB トランザクションと、その外の clearCart / emit の境界を補足文で明示する。補足文は関数 node ではない。
API の返却型で使われる Date のシリアライズ、認証詳細、全体の例外変換、性能・並行更新・全 flow の網羅は未検証。
変更シナリオの影響表示はモック内に記述したもの。自動解析の正しさを評価するモックではない。

外部ライブラリ・Web フォント・ネットワークからの画像には依存しない。

## 検証

リポジトリルートで `node mocks/studio-spatial/verify.mjs` を実行する。
TypeScript AST を使い、宣言・所属・シグネチャ・コード抜粋・注入先の呼出／property 読取・省略メンバー・継承・config登録を実コードと照合する。これは fixture の検証であり、画面用データを生成する抽出器ではない。対象メソッド外や任意の型・別名・動的な注入の解決まで保証するものではない。

ブラウザ検証は `node mocks/studio-spatial/verify.mjs --browser`。Playwright が必要。
依存を別環境から使う場合は `PLAYWRIGHT_MODULE` にモジュールのパスを渡す。`CHROMIUM_EXECUTABLE` は任意。
3画面サイズ、全 node・group・property・タブ、flow、型の仮変更、リセット、キーボード、直接HTMLを開く動作、旧版アセットがキャッシュされたブラウザでのHTTP更新を確認する。UIの読みやすさはこの自動検証では判定しない。
