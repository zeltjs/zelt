# Studio抽出設計 — 手書きsnapshotを実コードから生成する

## 0. やりたいこと

この節では、何を作り、何を変えないかを決める。

いまのStudio mockは手書きの `public/ec-backend.snapshot.json` を読んで地図を出している。これを **`zelt studio extract` が実コードから生成したJSONに置き換え、今のStudioにそのまま読ませる**。

- **完了の定義**: ec-backendから `zelt studio extract` でJSONを生成し、そのJSONをStudioで表示できること。受入条件は[付録M](#m-完了判定)。
- **前提1 — 手触りは変えない**: 配信データの契約は現行v1（[`src/snapshot-schema.lib.ts`](src/snapshot-schema.lib.ts)、説明は[react-migration-design.md](react-migration-design.md)の「fetchするデータ」節）。v1からの変更は、[4節](#41-v1からの変更は7点だけ)に挙げる削除5点・置換1点・移動1点だけ。
- **前提2 — 汎用化は抽出器の内部構造の話**: 抽出器を「TS索引（どのTSコードにも効く）＋任意plugin（Zelt・Vitest・Valibot・Drizzle等の意味）」に分ける。pluginが無くても同じv1の型で地図は出て、意味が粗くなるだけ。
- 手書きの `snapshot.json` は、自動抽出ができるまでコミットし続ける。

この文書は設計のみ。抽出器・UIのコードはまだ変更しない。

**読み方**: 2節のpolicyに合意できれば、3節は確認用の具体例、4節はpolicyとユーザー判断から決まった結果。判断が要る事項はもう残っていない（5節）。付録は実装の細則でレビュー不要。

## 1. 全体の箱

この節では、抽出器を構成する箱と、それぞれが何を決めるかを示す。矢印はデータの受渡しで、アプリ内の依存を描いた図とは別物。

~~~mermaid
flowchart LR
  S["実コード<br/>TS / tsconfig"] --> T["TS索引<br/>宣言・参照・所在"]
  T --> P["任意plugin<br/>Zelt / Vitest<br/>Valibot / Drizzle"]
  T --> A["組立<br/>ID照合・統合・検証"]
  P --> A
  C["config<br/>対象・plugin・列"] --> A
  C -.-> T
  C -.-> P
  A --> G["配信JSON<br/>StudioSnapshot（v1）"]
  G --> V["既存Studio<br/>地図 → 契約 / 実コード"]
~~~

| 箱 | 任せること | 任せないこと |
| --- | --- | --- |
| TS索引 | 実在する宣言・call/read/type等・包含・source | layerや「業務上の注文処理」の創作 |
| plugin | 意味の付与（declaration kind・relation kind・test対応）と注記（hints）の付与 | 他pluginの出力の書換え、別IDの宣言の新造 |
| 組立 | 共通IDで情報を結び、v1の所有者の中へ格納 | 未解決を「なし」に変換すること |
| config | 収録範囲、原文を出す範囲、globによる列とrole、明示した実行環境 | 実コードにない依存線の手入力、列内の並び順 |
| Studio | 列内の並び順とy座標の計算・折りたたみ・選択・lock・詳細表示 | TS解析、Zelt固有の意味の再判定 |

## 2. Policy

この節は「何を決めれば、残りが自動的に決まるか」に答える。ここに並ぶ7つが、この設計の判断の土台。policyだけでは1つに決まらず人が選んだものは、4節で根拠のpolicyと一緒に示す。

この節から使う言葉は4つだけ。前の3つは値の出どころ、最後の1つは地図の上での扱い。

- **事実**: コードを読めば誰がやっても同じになるもの（「AがBを呼ぶ」「このmethodは `POST /api/auth/register` のrouteに登録されている」）。
- **意味**: 事実のうち、ライブラリを知って初めて分かるもの（「この値はValibotのschema」）。pluginが付ける。
- **注記**: 宣言の横に出す短いラベル（`POST /api/auth/register` など）。pluginが自分の見つけた事実から付ける。
- **列**: 地図の横位置（`Entry / Middleware`・`Use case` など）。どのファイルをどの列に置くかは、人がconfigのglobで決める。

### policyの全体像

P1が枠を決め、P1が外した値の行き先が3つに分かれる。各ノードの「縛る」は、そのpolicyが制約する箱。

~~~mermaid
flowchart TB
  P1["P1 手触りを保つ<br/>縛る: 組立の出力"]
  P1 -->|コードにある値| P2["P2 事実だけを書く<br/>縛る: TS索引・plugin"]
  P1 -->|表示のための値| P4["P4 見せ方はUIが決める<br/>縛る: UI"]
  P1 -->|人の意図| P5["P5 範囲と配置は人が決める<br/>縛る: config"]
  P2 -->|意味の出どころ| P3["P3 pluginは足すだけ<br/>縛る: plugin"]
  P2 -->|取れないとき| P6["P6 分からないものは分からないと書く<br/>縛る: TS索引・組立"]
  P2 -->|testに当てはめると| P7["P7 testは直接触ったものにだけ結ぶ<br/>縛る: plugin・組立"]
~~~

### 枠: 形を変えない

**P1 手触りを保つ。出力は今のStudioが読む形（v1）のまま。変えるのは、コードに根拠のない値を外すことだけ。**
目的は手書きJSONを置き換えることで、Studioを作り直すことではない。形を変える提案は「手触りを保ち、かつ汎用化に効く」と示せたときだけ受け入れる。

### コードにある値: 何を書くか

**P2 事実だけを書く。構造はTS索引から、意味はpluginから取る。推定・創作・名前一致での帳尻合わせはしない。**
地図が一か所でも嘘をつくと、地図全体が信用できなくなる。人が書いた説明文や、コードに無いUseCase・Portの箱は、コードが変わっても追従しない。

**P3 pluginは意味と注記を足すだけ。pluginが無ければ地図が粗くなるだけで、壊れない。**
これが汎用化の核心。Zeltを使わないTSプロジェクトでも、同じ形の地図が出る。

**P6 分からないものは「分からない」として残す。事実どうしが矛盾したら、生成を止める。**
「無い」と「分からない」を混ぜると、地図が実際より安全に見える。矛盾をどちらか一方に寄せると、誤りが静かに残る。

**P7 testは、そのtestが直接触ったものにだけ結ぶ。**
Unitはcase本文が直接呼んだ関数、E2Eは送ったrequestのrouteを登録したmethod。そこから間接的に届いた関数まで「このtestが試している」とは言えない（既存の決定）。

### コードに無い値: 誰が決めるか

**P4 見せ方はUIが決める。並び順・座標・チップ（middleware・eventを示す小札）は、UIがJSONの関係から計算する。JSONに表示のための値を置かない。**
表示の値をJSONに焼くと、関係と表示の二か所に同じことを持つことになり、ずれる。

**P5 何を収録するか、原文を見せるか、どの列に置くかは、人がconfigで決める。**
これらはコードに書かれていない、プロジェクトごとの意図。抽出器は推測しない。

## 3. 1本の例で見る

この節は「policyは実際のコードでどう効くか」に答える。題材はec-backendの会員登録API、`AuthController.register`。

実コード（[auth.controller.ts](../../integration/ec-backend/src/entry/controllers/auth.controller.ts) 13〜19行）:

~~~ts
@RateLimit({ limit: 3, windowSec: 60, key: 'auth:register' })
@Post('/register')
async register(req = request(RegisterSchema)) {
  const data = await req.body();
  const user = await this.authService.register(data);
  return user;
}
~~~

### 左から右へ、各段が何を足すか

~~~mermaid
flowchart LR
  S["実コード<br/>@Post・@RateLimit<br/>request(RegisterSchema)<br/>this.authService.register"]
  T["TS索引の事実 〔P2〕<br/>call → AuthService.register<br/>read → RegisterSchema"]
  P["pluginが足すもの 〔P3〕<br/>zelt: 注記 POST /api/auth/register<br/>zelt: middleware 4本<br/>valibot: readをschemaへ"]
  A["組立 〔P6・P7〕<br/>同じ線は1本にまとめる<br/>E2E testをroute一致で付ける<br/>矛盾があれば止める"]
  U["Studio 〔P4・P5〕<br/>Entry列（configのglob）<br/>並び順はUIが計算<br/>注記 POST /api/auth/register"]
  S --> T --> P --> A --> U
~~~

- **TS索引**は、どのTSプロジェクトでも取れる線だけを取る。`register` がどのURLのrouteに登録されているかは、TSだけでは分からない（P2）。
- **plugin:zelt**は、Zeltが実行時に持つroute・middlewareの登録情報を読んで、middlewareの線と注記を足す。routeのmethod・pathは、注記として出るほか、E2E testを結ぶ照合に使う。middlewareは、app.tsで登録したLogging、core組込みのCors・SecureHeaders、`@RateLimit` が内部で付けるRateLimitの4本（P2・P3）。
- **plugin:valibot**は、`RegisterSchema` がValibotのschemaであることを確かめ、TSの `read` を `schema` の線に置き換える。線を2本にはしない（P3）。

### 手書きfixtureとの対応

現行の `public/ec-backend.snapshot.json` の `AuthController.register` と照合した結果。

| fixtureにあるもの | 抽出ではどうなるか |
| --- | --- |
| `AuthService.register` へのcall | 同じ（TS索引） |
| `RegisterSchema` へのschema線 | 同じ（TSのread → valibotがschemaへ） |
| middleware線4本 | 同じ（plugin:zelt） |
| 注記 `POST /api/auth/register` | 同じ（plugin:zeltがrouteから付ける） |
| 位置 `expandedY: 70` | なくなる。UIが計算する（P4） |
| http entry（method・path・E2E一覧） | なくなる。method・pathは注記に、E2E一覧は宣言に直接付く（4.1） |
| `this.authService` を読む線（fixtureに無い） | 無いまま。`authService` はparameter propertyなので宣言にせず、読む線も引かない（[4.9](#49-注入された値は宣言にしない)） |

一方、次は変わる。

- **注記が消えるもの**（P2）: 隣の `AuthService.register` の「RegisterInput → user」、`RegisterSchema` の「email / password / name」は人の説明文なので消える。`RegisterInput` の `InferOutput<RegisterSchema>` はplugin:valibotが付けるので残る。
- **IDが変わる**: `AuthController.register` という短いIDは、抽出の形式に変わる。画面には名前を出す（[4.11](#411-idは抽出の形式になり古いurlは引き継がない)）。

### pluginを外すと

Zeltのpluginを外すと、middleware線・注記・E2E testの結び付きが消え、`register` は「AuthServiceを呼ぶmethod」としてだけ残る。Valibotのpluginを外すと、schema線はただのreadに戻る。どちらでも地図の形は同じまま（P3）。

E2Eで同じappに `POST /api/auth/register` を送るtestがあれば、そのtestは、このrouteを登録した `register` に付く。結ぶ根拠は、testが送るmethod・pathと、plugin:zeltがroute登録から取ったmethod・pathの一致。`AuthService.register` には付かない（P7）。

## 4. Policyから決まること

この節は「policyを決めると、何が決まるか」に答える。**ここに並ぶものは判断ではなく結果**で、左のpolicyに合意していれば読み飛ばしてよい。

4.1〜4.7はpolicyだけから決まる。4.8〜4.11は、policyだけでは1つに決まらず、ユーザーが選択肢から選んだもの（ユーザー判断）。各小節の冒頭に、選んだものと根拠のpolicyを1行で示す。

図では、同じ対象を扱う結果を1つの箱にまとめている。

~~~mermaid
flowchart LR
  subgraph Policy
    P1["P1 手触り"]
    P2["P2 事実だけ"]
    P3["P3 足すだけ"]
    P4["P4 見せ方はUI"]
    P5["P5 人がconfig"]
    P6["P6 分からない"]
    P7["P7 直接だけ"]
  end
  subgraph 結果
    R1["JSONの形<br/>4.1 v1からの変更7点<br/>4.11 IDの形式"]
    R2["注記<br/>4.2 付け方<br/>4.10 1つずつ行"]
    R3["線と宣言<br/>4.3 pluginが無いとき<br/>4.8 contract<br/>4.9 注入された値"]
    R4["表示と範囲<br/>4.4 並び順と座標<br/>4.5 原文を伏せる方法"]
    R5["4.6 未解決と生成失敗"]
    R6["4.7 testの結び方"]
  end
  P1 --> R1
  P2 --> R1
  P4 --> R1
  P5 --> R1
  P6 --> R1
  P7 --> R1
  P2 --> R2
  P3 --> R2
  P4 --> R2
  P1 --> R3
  P2 --> R3
  P3 --> R3
  P4 --> R4
  P5 --> R4
  P6 --> R5
  P2 --> R6
  P7 --> R6
~~~

### 4.1 v1からの変更は7点だけ

P1より、変更はコードに根拠のない値の除去と、それに伴う置換・移動に限られる。どの値をどうするかは、その値の出どころで決まる。

| v1の値 | 変更 | 決めたpolicy |
| --- | --- | --- |
| `expandedY`（グループの縦位置） | 削除 | P4: 位置は表示の値 |
| `excerpt.kind: 'redacted'` | 削除 | P5: 伏せる範囲は人がconfigで決める（4.5） |
| `presentation.origin` | 削除 | P2: 抽出物は常に抽出由来。Studioも使っていない |
| `demoScenarios` | 削除 | P2: 仮の変更はコードの事実ではない（diffで表す） |
| `entries`（入口の一覧） | 削除 | P5: 入口はEntry列（人がconfigで決める配置）にいる宣言のことで、別に持たない。HTTPのmethod・pathは注記に移る（P3） |
| `hint`（1つの文字列） | `hints: { provider, label }[]` に置換 | P2・P3: 人の説明文は消え、複数pluginの注記が並ぶ |
| E2E test一覧（entryの中） | 宣言に直接付ける（Unit test一覧と同じ置き方） | P7: routeを登録したmethodに、route（method・path）の一致で付く |

`entries` を無くすと、それを使っていた起点ショートカット（右上のselectと、その横の種類フィルタ）も無くなる。これはmockから外す（ユーザー判断）。lifecycle（起動・終了時の呼出）の入口は、使い道がこのselectだけだったので一緒に消える。

配信型の差分は[付録A](#a-出力の形)。

### 4.2 注記は、pluginが自分の見つけた事実から付ける

P2・P3より、注記の出どころはpluginが確かめた事実だけになる。人の説明文だった現行の注記（約60件）は抽出後は消える。

| plugin | 注記の例 |
| --- | --- |
| zelt | HTTP routeを登録したmethodに `POST /api/auth/register`、event購読に `EVENT order:created`、DIのconstructorに `DI / 初期化` |
| drizzle | table宣言にtable名（`users`）、そこから作った型に `DB schema由来` |
| valibot | schemaから作った型に `InferOutput<RegisterSchema>` |

1つの宣言に複数pluginが付けたら、並ぶだけで衝突しない（画面での出し方は[4.10](#410-注記は1つずつ行にする)）。middleware・eventのチップは注記に入れない。チップはUIが関係の種類（`middleware`・`event`）だけから作る表示であり（P4）、関係そのものがJSONの正。全規則は[付録A](#注記の付与規則全表)。

### 4.3 pluginが無いとき、意味は粗くなるだけ

P3より、pluginが無い場合の値は次の2種類に落ちる。

- **一般的な意味に戻る**: schema・tableは「値」とその「read」になる。contractはTS索引の値なので、pluginが無くても残る（[4.8](#48-contractは呼んだ先がinterfaceのmemberかで引く)）。
- **出なくなる**: middleware・event・registerの線、test一覧（E2Eはrouteが分からないので結ぶ先が無く、一覧が空になる）、注記。

どちらもv1の型の範囲に収まる。対応表は[付録A](#pluginが無いときの汎用値全表)。

### 4.4 並び順と座標はUIが計算する

P4より、列内の並び順とy座標はJSONに無く、UIが関係から求める。並び順は既存の決定どおり「callのトポロジカル順、呼ぶ側が上、同順位は名前順」。JSON内の配列の順序には表示の意味を持たせない。

### 4.5 原文を伏せるのはconfig

P5より、秘密を含みうるファイルを伏せるのは抽出器の自動判定ではなく、人がconfigで「原文を出す範囲」から外すことで行う。外したファイルは「宣言だけ」の表示になる。ec-backendでは `src/config/` を外す。列とroleもconfigのglobで決まる。

### 4.6 未解決は残し、矛盾は止める

P6より、次の3つが決まる。

- 解けなかった参照は、v1の「未解決」欄に理由付きで残す。偽の宣言を作って線をつなげない。
- 取りきれなかった範囲は、test一覧の取得状況を「一部のみ（partial）」にする。取っていないものを「0件」と表示しない。
- 事実どうしが矛盾したら（例: 同じroute登録に2つの異なるmethod・path）、どちらかを採らずに生成を失敗させる。失敗した生成は配信せず、前回のJSONを残す。

### 4.7 testの結び方

P7・P2より、testと宣言の対応は次のように決まる。

- **Unit**: case本文が直接呼んだ関数に付ける。呼んだ先の、さらに先の関数には伝播させない。
- **setup**（どれをmockにしたか）: 呼び出した値がどのtest用factoryから来たかを追い、一致したときだけ付ける。型や名前が同じだけでは結ばない。
- **E2E**: testが送ったrequestのmethod・pathと、plugin:zeltがroute登録から取ったmethod・pathが同じappで一致したとき、そのrouteを登録したmethodに付ける（既存決定のルート文字列照合と同じ）。Unit一覧とは混ぜない。

### 4.8 contractは、呼んだ先がinterfaceのmemberかで引く

選んだもの: 旧5.1の(a)（ユーザー判断）。根拠はP2（TSの事実だけで決まる）とP3（Zeltに依存しない）。

~~~mermaid
flowchart LR
  subgraph CS["CartService"]
    CT["constructor<br/>store = kv.namespace('cart:')"]
    GC["getCart<br/>this.store.get(…)"]
  end
  KV["KVStore（interface）<br/>get"]
  GC -->|contract| KV
~~~

- callの呼んだ先の宣言がinterfaceのmemberなら、そのcallを `contract`（地図では破線）にする。TS索引の事実だけで決まる。
- fixtureの6本（`CartService` の5つのmethod → `KVStore` の `get`・`set`・`del`）はそのまま出る。`store` は注入された値ではなく `namespace('cart:')` の戻り値（型は `KVStore`）なので、ZeltのDIを辿らなくても引ける。
- contractはplugin:zeltの値ではなくTS索引の値になる。pluginを外しても `call` に戻らない（4.3）。
- 外部ライブラリのinterface（better-sqlite3の `Database.exec` など）にも当たる。どこまで含めるかは[付録N](#n-実装時に決めること)。

### 4.9 注入された値は宣言にしない

選んだもの: 旧5.4の(b)（ユーザー判断）。P1を優先し、読んだ事実を1種類地図に出さない。Zeltに依存しない規則にするのはP3（pluginは宣言を消せない）から。

- constructorのparameter propertyは、注入された値かどうかに関わらず宣言にしない。`constructor(private readonly authService = inject(AuthService))` の `authService` は地図に行を持たない。
- `this.authService.register(…)` からは `AuthService.register` へのcallだけが出る。途中の `this.authService` の読み取りは**線を引く対象ではない**。「未解決」ではないので、未解決欄（4.6）にも載せない。
- fixtureが暗黙にしていた判断と同じ。`this.config.cookieName` も `JwtConfig.cookieName` へのread 1本だけで、途中の `this.config` へのreadは無い。
- ec-backendでは、parameter property（10 class・14件）の宣言と、それを読む延べ約36組の線が出ない。

### 4.10 注記は1つずつ行にする

選んだもの: 旧5.2の(c)（ユーザー判断）。根拠はP4（見せ方はUIが決める）と、注記という事実を画面から落とさないこと（P2）。

- 1つの宣言に注記が複数付いたら、注記ごとに行を増やす。宣言の行が高くなり、groupの高さも変わる。
- 今のmockとは見た目が変わる（P1に触れる）。この文書の後でmockを更新するので、そこで示す。UIの追従は[付録L](#l-uiの追従)。
- ec-backendでは、注記が2つ以上付く宣言は無い。複数になるのは、同じmethodを2つのrouteに登録したときや、2つのpluginが同じ型に注記を付けるとき。

### 4.11 IDは抽出の形式になり、古いURLは引き継がない

選んだもの: 旧5.3の(a)（ユーザー判断）。URLの互換は要らない。根拠はP2（旧IDと新IDを名前の一致で対応させない）とP6（分からないIDを別の宣言で埋めない）。

- IDは[付録B](#箱の切り方とid)の形（groupのIDを中に含むJSON、1つ約110文字）になる。URLに保存する `node`（選んだ宣言）・`root`（lockした起点）もこのIDになり、長くなる。
- fixtureの時点のURLを開くと、今の実装どおり「Unknown identity」の通知が出て、選択もlockも無い初期表示になる。別の宣言を黙って選ばない。
- IDを画面にそのまま出している箇所（groupの見出し・詳細の見出し・検索結果・検索の対象）は、名前の表示に替える（P4。[付録L](#l-uiの追従)）。

## 5. 未決

判断が要る事項は残っていない。旧5.1〜5.4はユーザーが選び、結果を[4.8〜4.11](#48-contractは呼んだ先がinterfaceのmemberかで引く)に移した。実装しながら決めればよいものは[付録N](#n-実装時に決めること)にある。

---

## 付録 実装詳細

**ここはpolicyの結果を実装に落としたもの。レビュー不要。** 各項の冒頭に、どのpolicyの実装かを示す。

TypeScriptブロックには2種類ある。**配信型**（v1、UIが読む）と、**抽出器内部の型**（配信しない）。内部型のブロックには見出しで「内部」と書く。

| 付録 | 内容 |
| --- | --- |
| A | 出力の形（配信型の差分・各フィールドの出どころ・注記と汎用値の全表） |
| B〜H | 各箱の取得方法（TS索引・plugin共通・Zelt・Library・Unit・E2E・config） |
| I〜M | 組立・生成・置き場所・UI追従・完了判定 |
| N〜P | 実装時に決めること・今は扱わないもの・確認状況 |

### A. 出力の形

実装するpolicy: P1（形はv1）、P2・P3（出どころ）、P4・P5（削除した値の行き先）。

#### 配信型の差分

| 変更 | 対象 | 理由 |
| --- | --- | --- |
| 削除 | `GroupPresentation.expandedY` | 並び順とy座標はUIが計算する。列内の並び順は既存決定「callsのトポロジカル順、呼ぶ側が上、同順位は名前順、構造からのみ計算」に従い、UIがrelationsから求める |
| 削除 | `excerpt.kind: 'redacted'` | UIはcodeと区別していない（[inspector.tsx](src/views/inspector.tsx)は `declaration-only` か否かだけを見る）。原文を見せたくないファイルはconfigの `sourceText` から外し、`declaration-only` にする |
| 削除 | `presentation.origin`（Map・Group・Declaration） | UI未使用。最上位の `provenance` と重複 |
| 削除 | `MapPresentation.demoScenarios` | 変更はdiffで表すものであり、JSONの1データではない |
| 削除 | `SourceDeclaration.entries`（`EntryPoint`） | 入口はEntry列（configの配置）にいる宣言のことで、別に持たない。HTTPのmethod・pathはplugin:zeltの `hints` に、E2E一覧は宣言の `e2eTests` に移る。起点ショートカットはmockから外す（ユーザー判断）。event・middlewareはrelationsのkindで表したまま |
| 移動 | `EntryPoint.e2eTests` → `SourceDeclaration.e2eTests: EndpointTests \| null` | routeを登録したmethodに付く。`null` はrouteを登録していない宣言（plugin:zeltが無いときは全宣言）。`EndpointTests` の形はv1のまま |
| 置換 | `presentation.hint: string \| null` → `hints: { provider; label }[]` | pluginが自分の見つけた事実から付ける注記。複数pluginの付与は配列に並ぶだけで衝突しない。UIはラベルを出すだけでZeltを知らない |
| 維持 | `presentation.columnId`・`role`、`MapPresentation.columns` | 人がconfigのglobで決める配置 |

配信型の差分（ここに無いv1の型はそのまま）:

~~~ts
interface Hint {
  readonly provider: string;
  readonly label: string;
}
interface SourceGroup {
  // v1の他フィールドは不変
  readonly hints: readonly Hint[];
  readonly presentation: GroupPresentation;
}
interface GroupPresentation {
  readonly columnId: ColumnId;
  readonly role: 'regular' | 'config' | 'composition';
}
interface SourceDeclaration {
  // v1の他フィールドは不変。presentationは中身が無くなるため持たない。entriesは持たない
  readonly hints: readonly Hint[];
  readonly e2eTests: EndpointTests | null;
}
interface SourceDetail {
  readonly location: SourceLocation;
  readonly signature: string;
  readonly excerpt:
    | { readonly kind: 'code'; readonly text: string }
    | { readonly kind: 'declaration-only' };
}
interface MapPresentation {
  readonly id: string;
  readonly columns: readonly {
    readonly id: ColumnId; readonly label: string; readonly width: number;
  }[];
}
~~~

#### v1の各フィールドを埋める箱

| v1のフィールド | 埋める箱 | 内容 |
| --- | --- | --- |
| `schemaVersion` / `provenance` | 組立 | 固定値。抽出の出力は必ず `extracted` |
| `snapshotId` | 組立 | 正規化JSONのSHA-256（[付録J](#j-生成とpublish)） |
| `project` | config | `project.id` / `name` |
| group `id` `name` `kind` `filePath` `members` | TS | 宣言の列挙と包含（[付録B](#b-ts索引)） |
| group `expansion` | TS＋config | includeに入る宣言は `included`、参照先として解決しただけの宣言は `boundary` |
| group `relations` | TS | class自身の `extends` / `implements` |
| 宣言 `id` `name` `enclosingDeclarationId` | TS | |
| 宣言 `kind` | TS → plugin | TSの種別。plugin:valibot/drizzleが `schema` / `table`、plugin:zeltが `event-type` に置き換える |
| 宣言 `relations` | TS → plugin | TSが `call` `read` `type` `returns` `construct` `override` `implements` `contract`（呼んだ先がinterfaceのmember）。plugin:zeltが `middleware` `event` `register`、plugin:valibot/drizzleが意味を付けた相手への `read` を `schema` / `table` にする |
| relation `evidence` | TS／plugin | `location` は根拠の所在、`expression` はその範囲の原文 |
| `source.location` / `signature` | TS | 宣言の所在と契約 |
| `source.excerpt` | TS＋config | `sourceText` に合うファイルだけ `code`、他は `declaration-only` |
| `unresolved` | TS | 解けなかった参照（理由はv1の5種） |
| 宣言 `unitTests` | plugin:vitest＋plugin:zelt＋組立 | case一覧はrunner、setupはZelt、対応付けは組立（[付録F](#f-unit)） |
| 宣言 `e2eTests` | plugin:zelt＋plugin:vitest＋plugin:http-requests＋組立 | routeを登録したmethodだけに付く（[付録G](#g-e2e)） |
| `hints`（group・宣言） | plugin | [下の表](#注記の付与規則全表) |
| `presentation.columnId` / `role`、`MapPresentation` | config | globのrulesとcolumns（[付録H](#h-config)） |

#### 注記の付与規則（全表）

hintsは、pluginが**自分で見つけた事実**からだけ付ける。人の説明文だったv1のhint（約60件。例「userId → Order」「header / cookie」）と「設定値は非表示」系は抽出後は消える（了承済み）。

| plugin | 付与先 | label | 手書きfixtureでの例 |
| --- | --- | --- | --- |
| zelt | HTTP routeのcontroller method | `<METHOD> <fullPath>` | `POST /api/auth/register` |
| zelt | event購読のcallback | `EVENT <eventName>` | `EVENT order:created` |
| zelt | Injectable / Configのconstructor | `DI / 初期化` | |
| zelt | lifecycle登録を確認したmethod | lifecycle登録を示すラベル（残すかは[付録N](#n-実装時に決めること)） | `lifecycle · 購読を登録`（文言は人の説明を含む） |
| zelt | core組込みのglobal middlewareの `use` | `全HTTP · core自動登録` | CorsMiddleware / SecureHeadersMiddleware |
| drizzle | table宣言 | table名（table builderの第1引数） | `order_items` |
| drizzle | `$inferSelect` / `$inferInsert` から作ったtype | `DB schema由来` | `User`、`NewOrder` |
| valibot | `InferOutput` から作ったtype | `InferOutput<Schema名>` | `InferOutput<RegisterSchema>` |

- 同じ宣言に複数pluginが付けたら配列に並べる。並びはprovider ID順、同provider内は根拠の位置順。同じprovider・labelは1件にまとめる。
- v1 fixtureのgroup hintは全件null。group向けの付与規則は今は無く、型としてgroupにも置けるだけ。
- middleware / eventのリレーションチップ（UIの[relations.lib.ts](src/relations.lib.ts)の `attachments`）はhintsに入れない。別の宣言への関連なのでrelationsがSSOTであり、チップにするのはUIがrelationsの種類（`middleware`・`event`）から導出する表示判断のまま。UIの「tag」（`RelationTag`）とJSONの `hints` は別物として名前を分ける。

#### pluginが無いときの汎用値（全表）

v1にあるライブラリ固有の値は、pluginが無ければ汎用値に落ちるだけで、型は壊れない。

| v1の値 | 付けるplugin | pluginが無いとき |
| --- | --- | --- |
| 宣言kind `schema` / `table` | valibot / drizzle | `value` |
| 宣言kind `event-type` | zelt | `signature`（`EventBusSchema` のmember） |
| relation kind `schema` / `table` | valibot / drizzle | `read` |
| relation kind `middleware` / `event` / `register` | zelt | 出ない |
| `e2eTests` | zelt＋vitest＋http-requests | 全宣言で `null`（routeが分からず結ぶ先が無い） |
| `unitTests` | vitest＋zelt | casesは空、coverageは `uncollected` |
| `hints` | 各plugin | 空配列 |

#### 抽出で埋まらない値

v1にあるが実コードから抽出できない値5つの扱い。

| v1の値 | 扱い | 理由 |
| --- | --- | --- |
| `presentation.expandedY` | 削除。UIが計算 | 手で調整した座標で、実コードに根拠が無い。並び順は構造（relations）から決められる |
| `presentation.hint`（人の説明文） | `hints` に置換。人の説明文は消える | 抽出できるのはpluginが見つけた事実だけ |
| `excerpt.kind: 'redacted'` | 削除。`sourceText` から外して `declaration-only` | 秘密値を自動検出できるとはしない。伏せたい範囲は人がconfigで決める |
| `presentation.origin` | 削除 | 抽出物は常に `provenance` で表せる。UI未使用 |
| `demoScenarios` | 削除 | 仮変更はdiffで表す。snapshotの一部ではない |

### B. TS索引

実装するpolicy: P2（構造はTSの事実から）、P6（解けない参照は `unresolved`）。

TS索引は、どのTSプロジェクトにも効く部分。宣言・参照・値の由来を1つのProgramから取り、全pluginが共用する。

~~~mermaid
flowchart LR
  P["1つのTS Program<br/>app + test + 参照先"] --> D["宣言表<br/>ID ↔ TS宣言<br/>group・包含・source"]
  P --> R["参照表<br/>owner → target<br/>call/read/type + 根拠"]
  D --> I["SourceIndex<br/>全pluginが共用"]
  R --> I
  I --> O["値の由来の照合<br/>test receiverとfactory<br/>app receiverとfactory"]
~~~

TS Compiler APIを使う目的は、宣言列挙、import aliasを含むSymbol解決、callのsignature解決、propertyの参照先、型参照、原文範囲の取得。Zeltが既に持つrouteやdecorator情報を同じ構文から再推測するためには使わない。

[既存inspect](../../packages/decorator-metadata/src/inspect/)の解決処理を参照するが、そのままではcallback・property・式のowner・読取参照が足りない。Studio用の共通索引を追加し、同じ生成中に別Programを作ってIDを混在させない。既存公開inspect APIの互換性は変えない。

内部型:

~~~ts
import type * as ts from 'typescript';

type Id = string;
type ProviderId = string;
interface Span {
  filePath: string;
  start: number; end: number;
  startLine: number; endLine: number;
}
interface Evidence {
  provider: ProviderId;
  span: Span;
  basis: 'syntax' | 'metadata' | 'configured';
}
interface Diagnostic {
  code: string;
  message: string;
  subject: Id | null;
  spans: Span[];
}
interface IndexedCall {
  id: Id; span: Span; owner: Id | null;
  target: Id | null;
  receiver: Span | null;
}
interface ExportReference { filePath: string; exportName: string }
interface SourceIndex {
  revision: string;
  program: ts.Program;
  checker: ts.TypeChecker;
  files: readonly ts.SourceFile[];
  declarations: readonly Id[];
  calls: readonly IndexedCall[];
  declaration(id: Id): ts.Node | undefined;
  declarationId(node: ts.Node): Id | null;
  call(id: Id): IndexedCall | undefined;
  node(span: Span): ts.Node | null;
  span(node: ts.Node): Span;
  directCalls(owner: Id): readonly IndexedCall[];
  resolveExport(ref: ExportReference): Id | null;
}
~~~

| 内部 | v1への出力 |
| --- | --- |
| `Span` | `SourceLocation` は `filePath` `startLine` `endLine` だけを出す。offsetは内部の照合用 |
| `Evidence` | `RelationEvidence` は `location`（spanの行）と `expression`（spanの原文）。`provider` `basis` は内部の検証・重複排除用 |
| `Diagnostic` | 参照の未解決は `unresolved` へ（下表）。それ以外は抽出結果の報告にだけ残す（[付録O](#o-今は扱わないもの)の「partialの理由の置き場」） |
| `revision` | 配信しない。pluginの結果が同じ版か照合するキー |

所在の規約: project rootからのPOSIX相対パス。offsetはUTF-16・0-based・半開区間。行は1-based。TSのgetStart/getEndを使う。

索引自体はTSの基本graphを持つ。testファイルも索引には入るが、通常の地図へは出さない。test setupが参照するtest専用classなどは必要な宣言だけboundaryとして組立時に出す。存在するIDへの参照を、所在のない名前へ落とさない。

pluginは索引・ASTを変更しない。未知IDはundefined、解けないsymbolはnull。別Programのnodeをspanへ渡すのは契約違反。`node(span)` は範囲完全一致の最深node、`directCalls` は入れ子関数へ降りず、引数内のcallは含む。

property/トップレベル変数のinitializerはその宣言が参照を所有する。それ以外のトップレベル実行文はfile groupが所有する。関数内では最内の関数が所有し、ローカル変数のためだけにnodeを増やさない。

#### 箱の切り方とID

| ソースの形 | group / 宣言 |
| --- | --- |
| class / interface | 宣言ごとのgroup。method・constructor・getter・property・signatureがmember |
| トップレベル関数 / 変数 / type | 同じモジュールのfile groupにmember。変数に直接束縛されたarrow/functionは `function` 一つで、`value` と二重化しない |
| 関数引数のcallback / 入れ子関数 | 独立した宣言（`callback`）。`enclosingDeclarationId` に最内の関数を設定。内部の依存はその宣言が所有 |
| constructorのparameter property | 宣言にしない（注入された値かどうかに関わらず。[4.9](#49-注入された値は宣言にしない)）。通常の引数・ローカル変数も値追跡のbindingであり宣言にしない |
| get / static・instance | 別の宣言。readはgetter。class自身へのextends/implementsはgroupが所有 |
| namespace / 入れ子class | 実際の宣言を収録し、修飾名をIDへ含める。実装都合の新しい業務groupは作らない |

折りたたみは表示上の集約。methodの関係をclassにも二重保存しない。interfaceは実在するものを収録するが、interfaceの無いコードへPortは足さない。

IDは `prefix + JSON.stringify(parts)`。groupは `["class|file|interface", path, qualifiedName]`、宣言は `[groupId, enclosingId, kind, staticOrInstance, name]`。無名callbackのnameは親内の構文順序による `@callback:0` 等で、表示でも生成名と分かるようにする。同名無名宣言は構文順のordinalを追加する。

callは `["call", path, start, end]`。relationは `[owner, to, kind]`。route（内部）は `[provider, registrationKey, subject]`。testは `[provider, registrationCallId, caseKey]`。すべて同じrevision内で照合する。名前付き宣言は前方への行追加でIDが変わらない。rename・匿名callbackの挿入順変更には永続性を保証しない。

fixtureの短いIDからこの形へ変わることの扱いは[4.11](#411-idは抽出の形式になり古いurlは引き継がない)。

#### 線の取得規則

| 線 | 機械的な取得方法と限界 |
| --- | --- |
| call / construct | getResolvedSignatureの宣言、alias解決後のSymbolへ。unionなどで実装候補が複数なら未解決。runtimeのoverride dispatchまでは保証しない |
| contract | call先の宣言がinterfaceのmemberなら、その `call` を `contract` にする。線は1本のままでkindだけが変わる。外部ライブラリのinterfaceを含める範囲は[付録N](#n-実装時に決めること) |
| read | property・getter・変数のSymbol。callee自身をreadとして二重化しないが、中間receiverのpropertyは読む。ただし相手がparameter propertyなら、宣言にしないので線を引かない（`unresolved` にも入れない） |
| type / returns | 型構文のSymbolを辿る。明示の戻り型はreturns、その他はtype。型文字列を再parseしない。推論された複合型の内部依存までは収集しない |
| extends / implements / override | heritage句と基底memberのSymbolから。基底classの場所を「Port」へ移動しない |
| callbackへの関係 | 外側が渡すcallbackにreadを張る。callは実行を静的に確認できた場合のみ。callback内の線を外側にも転記しない |
| 動的property / 関数を保持した変数 | 定数property名・不変aliasまでは解決。可変bindingや複数候補は `unresolved` |
| 外部ライブラリ | 参照先が取れればboundary。外部実装の内部を再帰展開しない |

`unresolved.reason` への対応: 動的property → `dynamic-access`、外部だと分かった未解決 → `external-boundary`、関数を保持した変数 → `stored-function-reference`、引数で受けたcallbackの呼出 → `parameter-callback`、その他のapp内の未解決 → `symbol-unresolved`。解けない相手には偽の宣言を作らない。

relationの同一性は所有者・to・kind。evidenceの異なるcallは同じ線の使用箇所として `evidence` に並べる。

実際の[OrderService.findById](../../integration/ec-backend/src/usecase/order.service.ts)では、`this.drizzle.db` からDrizzleService.dbへのreadが残る。`select()` が外部APIでもこの線を省かない。`orders` はdrizzle pluginにより `table` 線になる。OrderRepositoryの箱は作らない。

#### sourceの規約

| 項目 | 契約 |
| --- | --- |
| signature | 修飾子・generic・optional・default・型aliasを維持。関数本体は除く。変数の型が省略されたときだけcheckerの型表示を補う |
| 原文 | `sourceText` に合うファイルだけ `code`。未許可は `declaration-only`。signature内の初期化値も未許可時は除く。秘密値を自動検出できるとはしない |
| 境界 | 参照先の宣言を同じProgramで解決できればboundaryの箱を作る。型定義も所在として有効 |

### C. plugin共通

実装するpolicy: P3（pluginは足すだけ）、P6（取れない範囲はpartial、契約違反は生成失敗）。

pluginは索引を読んで「事実（Fact）」を返すだけの箱。どの事実がv1のどこへ出るかをここで固定する。

~~~mermaid
flowchart LR
  I["SourceIndex<br/>共通ID・call・source"] --> Z["Zelt<br/>意味 / DI / route / setup"]
  I --> T["Runner<br/>test / suite / hook"]
  I --> L["Library<br/>schema / table / request"]
  Z --> F["PluginResult<br/>facts + reports<br/>revision"]
  T --> F
  L --> F
  F --> A["組立<br/>所有者へ格納<br/>receiverとsetupを照合"]
~~~

plugin間の呼出はしない。VitestはZeltのtargetを知らず、ZeltはitやbeforeEachを知らない。Jest/Mocha追加時もrunnerの箱だけ差し替える。初期実装はVitestと下記ライブラリpluginを同梱し、外部pluginの動的インストール・公開SDK化は対象外。

内部型:

~~~ts
type Semantic = 'schema' | 'table' | 'event-type' | 'service' | 'config';
type PluginRelationKind = 'middleware' | 'event' | 'register';
type Feature = 'declarations' | 'relations' | 'semantics' | 'hints' | 'routes'
  | 'tests' | 'test-setups' | 'requests' | 'unit-associations' | 'e2e-associations';
interface AnalysisScope {
  files: string[];
  category: 'source' | 'unit' | 'e2e' | 'unclassified';
}
interface AnalysisReport {
  id: Id; provider: ProviderId; feature: Feature;
  status: 'disabled' | 'uncollected' | 'complete-in-scope' | 'partial';
  scope: AnalysisScope;
  inspectedFiles: string[];
  diagnostics: Diagnostic[];
}
type Fact =
  | { kind: 'semantic'; subject: Id; value: Semantic; evidence: Evidence[] }
  | { kind: 'relation'; from: Id; to: Id; relation: PluginRelationKind;
      applicationId: Id | null; evidence: Evidence[] }
  | { kind: 'route'; subject: Id; registrationKey: string; applicationId: Id;
      method: string; path: string; evidence: Evidence[] }
  | { kind: 'hint'; subject: Id; label: string; evidence: Evidence[] }
  | { kind: 'test'; value: TestContribution }
  | { kind: 'setup'; value: SetupContribution }
  | { kind: 'application'; value: ApplicationContribution }
  | { kind: 'request'; value: RequestContribution };
interface PluginInput {
  source: SourceIndex;
  scopes: readonly AnalysisScope[];
}
interface PluginResult {
  revision: string;
  facts: Fact[];
  reports: AnalysisReport[];
}
interface ExtractionPlugin {
  id: ProviderId;
  features: readonly Feature[];
  analyze(input: PluginInput): Promise<PluginResult>;
}
~~~

| Fact | feature | v1への出力 |
| --- | --- | --- |
| semantic `schema` / `table` / `event-type` | semantics | 対象宣言の `kind` を置き換える。その宣言への `read` 線の `kind` も `schema` / `table` にする（線は複製しない） |
| semantic `service` / `config` | semantics | 配信しない。UnitSetupの `dependencies[].kind` とDIの照合に使う |
| relation | relations | 所有者の `relations` に `middleware` / `event` / `register` として追加 |
| route | routes | 配信しない。E2E testを結ぶ照合（[付録G](#g-e2e)）に使う。method・pathの注記は別のhintとして出す |
| hint | hints | 対象の `hints` に `{ provider: plugin.id, label }` |
| test / setup | tests / test-setups | 組立を経て `unitTests` / `e2eTests` |
| application / request | requests | 組立を経て `e2eTests` |

`AnalysisReport` は内部の取得状況。v1には `AssociationCoverage { status, searchScope, inspectedFiles }` としてだけ出る（`status` は `disabled` を `uncollected` に写す、`searchScope` は `scope.files`）。それ以外の報告は抽出結果として返し、配信しない。

complete-in-scopeは、**configで選んだ範囲内**を列挙できたという意味。未対応syntax・不明なtarget・動的なtest登録があればpartial。casesが空でもuncollectedなら「testなし」ではない。

`scope.files` はglob展開後の正準path一覧、`inspectedFiles` は実際に読んだ一覧。report IDはprovider・feature・category・scope.filesから作る。tsはsource、runnerは指定test scope、Zeltはsourceと指定Unit scopeを担当し、各担当feature/scopeについて必ずreportを返す。設定されていない組合せはhostがdisabledとして記録する。

hostがplugin.idとreport/evidenceのproviderの一致を検証する。索引にないID、別revision、宣言していないfeature、report欠落、scope外の読み取りは契約違反。例外・不正ID・metadata worker失敗はpartialではなく生成失敗。失敗した新JSONは配信しない。

### D. Zelt

実装するpolicy: P2（runtimeのmetadataという事実から意味を付ける。名前一致で結ばない）、P3（Zeltの意味と注記を足す）。

plugin:zeltは、runtimeのmetadata（route・middleware・DI・event・lifecycle）をTSの宣言IDへ結び、Zelt由来のrelation kind・hintsと、E2E照合用のroute（内部）を出す。contractはTS索引が引くので、plugin:zeltは扱わない（[4.8](#48-contractは呼んだ先がinterfaceのmemberかで引く)）。

~~~mermaid
flowchart LR
  W["隔離worker<br/>指定app・照合対象module<br/>metadata・登録を読む"] --> R["RuntimeReference<br/>module export / 宣言位置<br/>ctor名一致は使わない"]
  R --> B["TSとの照合<br/>同じsource mapping<br/>Symbol → 共通ID"]
  B --> F["Zelt facts<br/>HTTP / middleware / DI<br/>config / event / lifecycle"]
~~~

[既存getClassSource](../../packages/decorator-metadata/src/inspect/class-source.lib.ts)は、constructor identityからmodule/exportを取得できる。一方、[現在のHTTP metadata](../../packages/core/src/features/http/http.types.ts)はcontroller名中心、globalMiddlewaresは適用範囲を平坦化する。**既存APIだけでは不足するので、以下のinspectionを実装に含める。** 名前・配列順で帳尻を合わせない。

内部型:

~~~ts
type RuntimeReference =
  | { kind: 'export'; module: ExportReference; member: string | null;
      memberKind: 'class' | 'method' | 'getter' | 'setter' | 'property';
      static: boolean }
  | { kind: 'declaration'; span: Span };
interface RuntimeHttpRoute {
  registrationKey: string;
  controller: RuntimeReference;
  methodName: string;
  method: string; path: string;
  span: Span;
  middleware: { target: RuntimeReference; span: Span }[];
}
interface RuntimeInspection {
  applicationId: Id;
  diagnostics: Diagnostic[];
  classes: { target: RuntimeReference; role: 'service' | 'config'; span: Span }[];
  routes: RuntimeHttpRoute[];
  eventBuses: { registrationKey: string; adaptor: RuntimeReference;
    handlers: RuntimeReference[]; span: Span }[];
}
interface MetadataInput {
  applicationId: Id;
  factory: ExportReference;
  subjects: ExportReference[];
  tsconfig: string;
  sourceModules: Record<string, string>;
  timeoutMs: number;
}
declare function inspectZelt(input: MetadataInput): Promise<RuntimeInspection>;
~~~

`applicationId` はconfigで付けるappの名前で、内部の照合キー。v1には出ない（1 appの前提。[付録O](#o-今は扱わないもの)）。

| 境界 | 実装する規則 |
| --- | --- |
| workerの起動 | tsxで専用processを起動。指定exportの引数なしfactoryを1回呼ぶ。subjectsは索引で確認したclassのexportであり、moduleをimportしてmetadataを読むだけ。createRuntime/realize・サービス生成・getter評価・test実行は禁止 |
| runtimeとsource | sourceModulesをTS hostのmodule解決と、node:module.registerで登録するworkerのresolve hookに共通適用。指定specifierは同じsource URL、未指定は通常解決。native module cacheを共有し、同一packageのdistとsrcが混在したら失敗 |
| 読取対象のclass | featureの登録class/configに、索引から得たexport済みの収録class・参照先classを加える。subjectsへtest moduleは渡さない。test専用config等は静的な継承・定義元Symbolで対応し、不明ならsetupをunresolvedにする |
| classの同定 | exportはchecker.getExportsOfModule＋alias解決。exportされないclassはdecorator traceの宣言位置へ照合。traceを出す読取APIを追加する。両方不可ならpartial、名前一致で代用しない |
| HTTP inspection | http blueprintにgetInspectionを追加。controller constructor identity、mountごとのfullPath、method、適用middlewareを保持。workerが上のRuntimeReferenceへ変換する |
| HTTP route | controller methodに hint `<METHOD> <fullPath>`。E2E照合用に、app・method・pathを持つroute factを返す（配信しない） |
| middleware | routingが使う登録・skip判定の共通処理をinspectionでも使用。組込みCors/SecureHeaders、親子mount、class/method decoratorを含める。middlewareの実行条件ではなく登録の適用関係を示す |
| middlewareの線 | routeのcontroller method → middleware実行methodへ `middleware` relation。実行methodを登録の型・Symbolから特定できなければpartial。組込みのglobal middlewareには hint `全HTTP · core自動登録` |
| DI/config | metadataのInjectable/Configの意味＋Symbolで識別したinject呼出。constructor default/property initializerを読む。constructor省略時は基底を辿る。動的provider・解けないsuper引数はpartial。Injectable/Configのconstructorに hint `DI / 初期化` |
| register | app factoryの登録式 → 登録されたclass（controller・middleware・handler・adaptor・config）へ `register`。event購読の登録式の所有者 → 購読callbackへ `register` |
| event | eventbus blueprintにもgetInspectionを追加しadaptor/handlersのidentityを公開。emit/onのSymbolと注入先busを照合。同じapp＋一意に解決した登録provider＋静的event名でのみ、emitの所有者 → 購読callbackへ `event` relation。購読callbackに hint `EVENT <eventName>`。`EventBusSchema` 拡張のmemberを `event-type` にする（型引数・宣言の解決による。event文字列と同名のtypeを探して結ばない） |
| lifecycle | 入口としては出さない（`entries` を廃止したため）。LifecycleManager.registerのSymbolとreceiverが解決し、Lifecycle契約のmethodが存在するときに限り、そのmethodにlifecycle登録の注記を付けうる。注記として残すかは[付録N](#n-実装時に決めること)。startupという名前だけでは判定しない |

event購読のbusはadaptorのgroup ID（内部の照合用）。同じappで同じproviderに複数のbus登録があり、注入先を一意に決められなければpartialにする。busを表す架空の宣言は作らない。

getInspectionは**新設するAPI**であって現在存在するという意味ではない。core内ではctorを保持する型、worker出口ではRuntimeInspectionというJSON型にする。登録位置はfeature生成時のtraceとdecorator位置から取得し、TS宣言位置へ正規化する。組込み登録はその定義位置を根拠にする。

workerはOSのsandboxではなく、moduleのトップレベル副作用は起こりうる。Zelt無効時はworkerもapp importも行わない。IPCに結果、stdout/stderrにログを分離し、timeout・import失敗・壊れた応答は生成失敗。DBやネットワークへ接続しないapp factoryを入力条件とする。

### E. Library

実装するpolicy: P2（定義元のSymbolという事実で判定し、名前の見た目では判定しない）、P3。

Library pluginは、ライブラリのexportへSymbolを解決できたときだけ意味とhintを付ける。

| plugin | 判定と出力 |
| --- | --- |
| valibot | initializerのcalleeをimport alias越しにvalibot exportへ解決し、戻り型が同packageのBaseSchema/BaseSchemaAsyncへ由来する場合に `schema`。suffixでは判定しない。`InferOutput<typeof X>` のtypeに hint `InferOutput<X>` |
| drizzle | drizzle-ormのtable builder Symbolと戻り型のTable由来を確認して `table` とhint（table名）。tableを読む線はTSのreadを `table` にする。`$inferSelect` / `$inferInsert` のtypeに hint `DB schema由来` |
| http-requests | 解決済みclient call、またはconfigのhelper契約からapp/method/pathを読む。E2Eへの対応は[付録G](#g-e2e)の組立が行う |

ライブラリversionでSymbolの定義元が変わり判別不能ならpartial。外見が似た呼出を成功扱いしない。

### F. Unit

実装するpolicy: P7（case本文が直接呼んだ宣言にだけ付ける）、P2（setupは値の由来という事実で結ぶ）、P6（未取得を空にしない）。

Unitの一覧は「case本文が直接呼んだ宣言」に付ける。setup（mock一覧・Solitary/Sociable）は、呼出のreceiverの由来をZeltのfactoryまで辿って別に結ぶ。

~~~mermaid
flowchart LR
  R["Runnerの事実<br/>登録・本文・適用hook"] --> U["Unit対応<br/>case本文の直接call<br/>→ 呼出先宣言"]
  Z["Zeltの事実<br/>factory call + target経路<br/>→ DI / override"] --> S["setup照合<br/>receiverの由来が<br/>factory + 経路と一致"]
  U --> S
  S --> V["宣言のunitTests<br/>cases[].calls[].setup"]
~~~

内部型:

~~~ts
interface HookStep {
  registration: Id; body: Id; lifetime: 'suite' | 'case';
}
type SetupContext =
  | { kind: 'ordered'; before: HookStep[]; concurrent: boolean }
  | { kind: 'unresolved'; reason: string };
interface TestContribution {
  registration: Id; caseKey: string;
  category: 'unit' | 'e2e' | 'unclassified';
  name: string | null; suite: (string | null)[];
  body: Id | null;
  mode: 'normal' | 'skip' | 'only' | 'todo';
  context: SetupContext;
  evidence: Evidence[];
}
interface SetupDetail {
  dependencies: { provide: Id; kind: 'service' | 'config' }[];
  configs: Id[];
  overrides: { provide: Id }[];
}
type SetupAnalysis =
  | { kind: 'uncollected' }
  | { kind: 'unresolved'; reason: 'dynamic-setup' | 'unresolved-provider' }
  | { kind: 'zelt'; detail: SetupDetail };
interface SetupContribution {
  factoryCall: Id;
  resultPath: string[];
  targetClass: Id;
  analysis: SetupAnalysis;
  evidence: Evidence[];
}
type ValueOrigin =
  | { kind: 'factory-result'; factoryCall: Id; path: string[]; evidence: Evidence[] }
  | { kind: 'unresolved'; reason: string; evidence: Evidence[] };
declare function traceOrigin(input: {
  source: SourceIndex; test: TestContribution; invocation: Id;
  value: Span;
}): ValueOrigin;
~~~

| 内部 | v1への出力 |
| --- | --- |
| TestContribution | `TestIdentity { id, name, suite, location }`。`location` は登録の所在。`mode` `caseKey` `category` は配信しない |
| 直接call | `UnitTestCase.calls[] { setup, invocation }` |
| SetupContribution | `UnitSetup { id, targetClass, location }`。`targetClass` と各Idは `ClassReference { filePath, name }` に写す。`location` はfactory callの所在 |
| `analysis.kind = 'zelt'` | `resolution: 'resolved'` と `dependencies` / `configs` / `overrides` |
| `analysis.kind = 'unresolved'` | `resolution: 'unresolved'` と同じ `reason` |
| `analysis.kind = 'uncollected'` | `resolution: 'unresolved', reason: 'not-collected'` |

| 箱 | 初版で扱う構文・規則 |
| --- | --- |
| Vitest登録 | import元・aliasを解決したdescribe/it/test/hook。globalsはconfigで明示した場合のみ。suiteの入れ子・concurrentを保持 |
| parameterized case | 静的な配列literalのeachはcaseKeyをindexにして展開。動的なtableはtemplate一件・partial。引数に依存するsetup値の代入は初版では未解決 |
| hook文脈 | configのserial/stackならbeforeEachを外suite→内suite、同suiteは登録順。concurrent・parallel・未知modifierは文脈未解決。beforeAll由来の共有値は初版の由来追跡対象外 |
| Unit対象 | case本文のdirectCallsで、収録したapp宣言への直接呼出を一覧化。同じcaseの同じtargetは一行、callsへ集約。helperの先・hook内・未実行callbackはテスト対象に伝播させない |
| receiver由来 | binding Symbolを使い、await/括弧/type assertion、変数代入、不変alias、静的property経路を追う。caseごとに外部bindingをunknownへ戻し、beforeEachから開始 |
| 未対応の由来 | 分岐・loop・動的property・分割代入・helperを経た代入は未解決。alias書換え、closure共有、非await非同期処理、opaque関数へのescapeが関係すればshared-state |
| setup照合 | factoryCall＋resultPathが一致し、呼出先の所属classとも矛盾しなければ付与。型が同じだけの別instanceへは付けない |
| Zelt factory | import SymbolでcreateTestTargetを特定。第一引数のclass、optionsのconfigs/overrides、返却値のtarget経路を読む。testを実行しない |
| Zelt詳細 | targetの直接DI、明示configs、setupFilesのconfigureTestDefaultsを読む。定数array/object/alias/spreadまで。動的値・解けない継承・global defaultsの読取漏れがあればunresolved |

setup機能が無効ならnot-collected。factoryに対応できてもDI等が不明ならunresolved。**未取得のdependenciesを空にしてSolitaryとは判定しない。**

Solitary/Sociableと mock一覧はUIがsetupから算出する（v1のまま）。抽出側は、config差替えとjose等の通常importをoverridesに入れない。overridesはserviceの差替え対象classだけで、useValueの中身は配信しない。

[JwtServiceのtest](../../packages/auth-jwt/src/jwt.service.test.ts)は、beforeEachのcreateTestTarget → testTarget.target → jwtService → case内のsignという由来を照合する。JwtConfig→TestJwtConfigはconfig差替えであってmockではない。CreateProductSchemaが内部から呼ばれるだけなら、そのschemaへUnit対象を伝播しない。

### G. E2E

実装するpolicy: P7（送ったrequestのrouteを登録したmethodにだけ付ける）、P2（app・method・pathの事実で照合し、名前やURLの見た目で結ばない）、P6。

E2Eは、testが送ったrequestとplugin:zeltのroute登録が同じapp・method・pathで一致したとき、そのrouteを登録したcontroller methodの `e2eTests` に付ける（既存決定のルート文字列照合と同じ）。Unit一覧とは混ぜない。

~~~mermaid
flowchart LR
  C["RunnerのE2E case<br/>本文のcall"] --> M["request照合<br/>同じapp + method + path"]
  Q["Request / Applicationの事実<br/>app式 + factoryの戻り値<br/>method / path"] --> M
  H["Zelt route登録<br/>app + method + path<br/>+ 登録したmethod"] --> M
  M --> E["宣言のe2eTests<br/>test行 + request所在"]
~~~

内部型:

~~~ts
interface RequestContribution {
  invocation: Id;
  application: Span;
  method: string;
  path: string;
  via: 'direct' | 'helper';
  evidence: Evidence[];
}
interface ApplicationContribution {
  factoryCall: Id;
  resultPath: string[];
  applicationId: Id;
  evidence: Evidence[];
}
~~~

v1への出力は `EndpointTestCase.requests[] { location, via }`（`location` はinvocationの所在）と `EndpointCoverage { status, searchScope, inspectedFiles, includesSharedSetup }`。

request pluginはrunnerを参照せず、request呼出候補と、設定で識別したapp factoryの戻り値の対応を別々に返す。applicationはdirect requestならapp.http.requestのapp式、helperなら指定されたapp引数の所在。組立がE2E caseのdirectCallsとinvocationを照合し、そのcaseのhook文脈でtraceOriginを呼ぶ。factoryCall＋resultPathがApplicationContributionと一致したときだけappを確定する。class名・URL・ファイル内の代入の存在だけでは結ばない。

traceOriginのvalueはinvocationのreceiverまたは引数内の式。Unitはreceiverを渡す。同一caseと適用hook内の評価順を使い、invocation後の代入は参照しない。別revision・case外のinvocation・そのcallと無関係なvalueは入力契約違反。

初版はapp.http.requestとconfigで宣言したhelperを扱う。ec-backendでは[authRequest](../../integration/ec-backend/e2e/helpers/test-setup.ts)のapp引数0・method引数2・path引数3を指定できる。registerUser/loginUserは固定のPOST/pathを指定できる。これはconfig由来の契約（basis `configured`）として、自動推論した事実と区別する。

method/pathはliteral・不変の定数alias・静的に連結できる文字列まで。direct requestは文字列URLとobject literalのinitを対象にし、method省略はGET、Request objectや可変initは未対応。URLのquery/hashを除き、pathを同一appのrouteへ照合する。初版のroute文法は固定segmentと必須の:parameter。複数候補、wildcard/regex、動的URLはpartialとして未対応にする。曖昧な場合に先頭のrouteへ付けない。

共有hook・helper内部の全requestを再帰実行した扱いにはしない。初版では `includesSharedSetup = false`。suite内に関連する未対応のrequest経路がある場合はE2E coverageをpartialにする。

### H. config

実装するpolicy: P5（収録範囲・原文の範囲・列は人が決める）、P4（列内の並び順とy座標はconfigでも決めない）。

configは、何を収録するか・原文をどこまで出すか・どのpluginを使うか・どの列に置くかを人が決める場所。

~~~mermaid
flowchart LR
  F["実ソースのfilePath"] --> R["順序付きglob rules<br/>最初に合うルール"]
  R --> P["GroupPresentation<br/>columnId / role"]
  P --> U["UIのlayout<br/>列内の並び順（relationsから）<br/>+ 表示中の高さ"]
  C["columns<br/>id / label / width"] --> U
~~~

内部型:

~~~ts
interface PresentationRule {
  files: string[];
  columnId: string;
  role: 'regular' | 'config' | 'composition';
}
interface PresentationConfig {
  id: string;
  columns: { id: string; label: string; width: number }[];
  rules: PresentationRule[];
  fallbackColumnId: string;
}
interface ExtractConfig {
  version: 1;
  project: { id: string; name: string };
  root: string;
  tsconfig: string;
  include: string[];
  exclude: string[];
  sourceText: string[];
  sourceModules: Record<string, string>;
  plugins: PluginConfig[];
  presentation: PresentationConfig;
  required: { provider: ProviderId; feature: Feature }[];
  output: string;
}
type StringInput = { kind: 'literal'; value: string }
  | { kind: 'argument'; index: number };
interface RequestHelper {
  function: ExportReference;
  applicationArgument: number;
  method: StringInput;
  path: StringInput;
}
interface TestScopeConfig {
  files: string[];
  category: 'unit' | 'e2e' | 'unclassified';
}
type PluginConfig =
  | { id: 'zelt'; applications: { id: Id; factory: ExportReference }[];
      setupFiles: string[]; setupDetails: boolean; timeoutMs: number }
  | { id: 'vitest'; scopes: TestScopeConfig[]; globals: boolean;
      cases: 'serial' | 'concurrent' | 'unknown';
      hooks: 'stack' | 'list' | 'parallel' | 'unknown' }
  | { id: 'valibot' }
  | { id: 'drizzle' }
  | { id: 'http-requests'; scopes: TestScopeConfig[];
      applications: { id: Id; factory: ExportReference; resultPath: string[] }[];
      helpers: RequestHelper[] };
~~~

`presentation` はv1の `MapPresentation { id, columns }` と各groupの `presentation { columnId, role }` にそのまま出る。

globはpicomatchのPOSIX・case-sensitive・dot=true、否定はexcludeだけで扱う。groupには最初に合ったruleのcolumnIdとroleを付ける。fallbackColumnIdを必須にし、未分類を勝手にUse caseへ置かない。

configのrootはconfigファイルから解決する。他のpath/globはroot基準。重複column ID・存在しないcolumn・重複plugin ID・project外へのoutputはエラー。sourceModulesは完全一致のpackage specifierをkeyにする。subpathは別keyで指定する。

設定にないpluginはdisabled。ZeltのsetupDetails=falseはtest-setupsをuncollectedとし、factory/targetの対応だけは返してよい。Vitestの実行設定は自動でserialにせず、利用中のrunner設定を明示する。setupFilesはrunner側の設定と一致させ、未指定のglobal defaultを不存在扱いしない。

ec-backendの設定例（上のExtractConfigに適合する）。rootをrepository rootとし、srcと参照先のpackage sourceを同じProgramで解決する。`sourceText` から `src/config/` を外し、configの原文は `declaration-only` にする（v1の `redacted` の代わり）。外部公開時はsourceTextを空にする。

~~~json
{
  "version": 1,
  "project": { "id": "ec-backend", "name": "EC Backend" },
  "root": ".",
  "tsconfig": "integration/ec-backend/tsconfig.json",
  "include": ["integration/ec-backend/src/**/*.ts"],
  "exclude": ["**/dist/**", "**/node_modules/**"],
  "sourceText": [
    "integration/ec-backend/src/app.ts",
    "integration/ec-backend/src/domain/**",
    "integration/ec-backend/src/entry/**",
    "integration/ec-backend/src/infra/**",
    "integration/ec-backend/src/usecase/**"
  ],
  "sourceModules": {
    "@zeltjs/core": "packages/core/src/index.ts",
    "@zeltjs/core/internal-bridge/testing": "packages/core/src/internal-bridge/testing.ts",
    "@zeltjs/core/internal-bridge/errors": "packages/core/src/internal-bridge/errors.ts",
    "@zeltjs/eventbus": "packages/eventbus/src/index.ts",
    "@zeltjs/auth-jwt": "packages/auth-jwt/src/index.ts",
    "@zeltjs/testing": "packages/testing/src/index.ts",
    "@zeltjs/decorator-metadata": "packages/decorator-metadata/src/index.ts",
    "@zeltjs/decorator-metadata/inspect": "packages/decorator-metadata/src/inspect/index.ts",
    "@zeltjs/kv": "packages/kv/src/index.ts",
    "@zeltjs/rate-limit": "packages/rate-limit/src/index.ts",
    "@zeltjs/redis": "packages/redis/src/index.ts",
    "@zeltjs/redis/testing": "packages/redis/src/testing/index.ts",
    "@zeltjs/unsafe-type-lib": "packages/unsafe-type-lib/src/index.ts"
  },
  "plugins": [
    {
      "id": "zelt",
      "applications": [
        { "id": "ec", "factory": { "filePath": "integration/ec-backend/src/app.ts", "exportName": "createEcApp" } }
      ],
      "setupFiles": [],
      "setupDetails": true,
      "timeoutMs": 30000
    },
    {
      "id": "vitest",
      "scopes": [
        { "files": ["packages/auth-jwt/src/**/*.test.ts"], "category": "unit" },
        { "files": ["integration/ec-backend/e2e/**/*.spec.ts"], "category": "e2e" }
      ],
      "globals": false, "cases": "serial", "hooks": "stack"
    },
    { "id": "valibot" },
    { "id": "drizzle" },
    {
      "id": "http-requests",
      "scopes": [{ "files": ["integration/ec-backend/e2e/**/*.spec.ts"], "category": "e2e" }],
      "applications": [
        {
          "id": "ec",
          "factory": { "filePath": "integration/ec-backend/e2e/helpers/test-setup.ts", "exportName": "createTestApp" },
          "resultPath": []
        }
      ],
      "helpers": [
        {
          "function": { "filePath": "integration/ec-backend/e2e/helpers/test-setup.ts", "exportName": "authRequest" },
          "applicationArgument": 0,
          "method": { "kind": "argument", "index": 2 },
          "path": { "kind": "argument", "index": 3 }
        }
      ]
    }
  ],
  "presentation": {
    "id": "ec-layers",
    "columns": [
      { "id": "entry", "label": "Entry", "width": 320 },
      { "id": "usecase", "label": "Use case", "width": 320 },
      { "id": "domain", "label": "Domain", "width": 320 },
      { "id": "infra", "label": "Adapter / Infrastructure", "width": 320 },
      { "id": "other", "label": "未分類・外部", "width": 320 }
    ],
    "rules": [
      { "files": ["integration/ec-backend/src/app.ts"], "columnId": "entry", "role": "composition" },
      { "files": ["**/*config.ts"], "columnId": "infra", "role": "config" },
      { "files": ["integration/ec-backend/src/entry/**"], "columnId": "entry", "role": "regular" },
      { "files": ["integration/ec-backend/src/usecase/**"], "columnId": "usecase", "role": "regular" },
      { "files": ["integration/ec-backend/src/domain/**"], "columnId": "domain", "role": "regular" },
      { "files": ["integration/ec-backend/src/infra/**"], "columnId": "infra", "role": "regular" }
    ],
    "fallbackColumnId": "other"
  },
  "required": [
    { "provider": "ts", "feature": "declarations" },
    { "provider": "zelt", "feature": "routes" }
  ],
  "output": "mocks/studio-spatial/public/ec-backend.snapshot.json"
}
~~~

この例のUnit範囲はJwtServiceのあるpackage、E2Eはec-backend。未指定packageのtestまで「なし」と主張しない。現行のauth-jwtとec-backendのVitest設定にはsetupFiles指定がないため、この例は空配列とする。requiredはcomplete-in-scopeを要求する機能。他の機能のpartialは配信してよいが、v1で見えるのはcoverageのstatusだけ。外部serviceを地図の内部として展開したい場合はincludeへそのsourceを追加する。

### I. 組立

実装するpolicy: P6（矛盾は生成失敗、先勝ちしない。未解決を「なし」にしない）、P2（配信するrelationは実在IDだけを参照）。

組立は「情報を足す」だけでなく、矛盾を止める。

~~~mermaid
flowchart LR
  I["SourceIndex<br/>宣言・基本関係"] --> A["assemble<br/>ID検証・事実の統合<br/>Unit/E2Eの対応"]
  P["PluginResult[]<br/>同じrevision"] --> A
  A --> J["StudioSnapshot（v1）<br/>schema検証<br/>全参照IDの検証"]
  J --> O["publish<br/>一時ファイル → rename<br/>失敗時は旧JSONを維持"]
~~~

内部型:

~~~ts
interface AssemblyInput {
  config: ExtractConfig;
  source: SourceIndex;
  plugins: { id: ProviderId; result: PluginResult }[];
}
interface ExtractionFailure {
  kind: 'failed';
  phase: 'config' | 'index' | 'plugin' | 'assembly' | 'publish';
  diagnostics: Diagnostic[];
}
type ExtractionResult =
  | { kind: 'published'; snapshotId: string; output: string; reports: AnalysisReport[] }
  | ExtractionFailure;
declare function buildIndex(config: ExtractConfig): Promise<SourceIndex>;
declare function createPlugins(config: ExtractConfig): ExtractionPlugin[];
declare function assemble(input: AssemblyInput): StudioSnapshot;
declare function extract(configFile: string): Promise<ExtractionResult>;
~~~

`StudioSnapshot` はv1（[付録A](#a-出力の形)の変更を反映したもの）。`reports` はCLIの出力であって配信しない。

| 入力・状態 | 組立／実行側の契約 |
| --- | --- |
| 同じ事実 | relationは所有者＋to＋kind、semanticはsubject＋kind、routeは登録ID、testはrunner＋登録＋caseKey、hintはsubject＋provider＋labelで併合。証拠は位置＋provider＋basisで重複排除 |
| kindの置換 | TSの `read` と相手の `schema` / `table` 意味は、同じ所有者・toの1本の線として置換後のkindで出す。2本にしない |
| 矛盾する事実 | 同じ登録を複数runnerが主張、同じsetup経路に異なるtarget、同じroute登録IDに異なるmethod・path、同じclassをserviceとconfigの両方に分類、同じ宣言に異なるsemantic kind等は生成失敗。先勝ちにしない |
| 不明な事実 | partial＋診断。配信するrelationは必ず実在IDを参照。不明な相手への線は `unresolved` か報告だけに残す |
| coverage | scopeごとにrunner＋対応付けのreportを合成。どちらかpartialならpartial、機能が無効ならuncollected。setupの未解決はcall対応を消さずsetup欄に残す |
| 機能の要求 | requiredの全reportがcomplete-in-scopeでなければpublishしない。設定にあるが未実装のplugin/featureはエラー |
| 入力の変更 | 読んだ全ソース・設定・metadata workerの入力を再hash。解析中に変わっていれば生成失敗、異なる版を混ぜない |
| 例外 | config/TS構文・解決の致命的エラー、plugin例外、worker timeout、invalid JSON、IO失敗は失敗として返す。空配列へのfallbackはしない |

### J. 生成とpublish

実装するpolicy: P6（失敗したら配信せず旧JSONを残す）、P4（JSONの順序に表示の意味を持たせない）。

実行コマンドは `zelt studio extract --config <config.json>`。成功はexit 0、生成失敗はexit 1。同じ出力先への同時生成は排他lockで拒否し、同じディレクトリの一時ファイルへ書いてschema再検証後にatomic renameする。失敗時は自分が作った一時ファイルだけ回収する。

解析用Programは指定tsconfigのmodule解決・target等を継承し、noEmit=true、rootDir/outDir/composite/incrementalの出力制約を外す。rootNamesはincludeの対象とtest/setup/helperの対象を合わせる。対象ファイルが0件、構文エラー、module未解決は生成失敗。意味解析の診断は報告へ残し、影響範囲の関係をpartialにする。

revision（内部）は、読み込んだソース・参照d.ts・package解決情報・tsconfigとextends・lockfile・抽出configを、正準path順の長さ付きUTF-8列としてSHA-256。plugin version/抽出器versionも含める。`snapshotId` はsnapshotId自身を除く全JSONをkey辞書順・配列の規定順で正規化してSHA-256。日時や絶対pathをhashに混ぜない。

出力順はgroupが正準filePath→ソース順、memberがソース順、relationはID順、testは登録位置/caseKey順、callsと根拠は位置順、hintsは[付録A](#注記の付与規則全表)の順。JSON上の順序に表示の意味は持たせない（列内の並びはUIが計算）。plugin実行順を入れ替えても同じJSONにする。

### K. 作るコードの置き場所

実装するpolicy: P3（TS索引・組立はZeltを知らない）、P4（UIはschemaだけに依存）。

ここに挙げるのは**次の実装時の変更予定**。今回新しいコードファイルは作らない。初版はCLI内に独立モジュールとして置き、package公開やplugin配布機構は増やさない。

~~~mermaid
flowchart TB
  CLI["CLI: studio extract<br/>config読取・publish"] --> CORE["extraction/core<br/>schema / index / assemble<br/>TSの知識。Zelt importなし"]
  CLI --> PLUGINS["extraction/plugins<br/>zelt / vitest / libraries / requests"]
  PLUGINS --> CORE
  PLUGINS --> BRIDGE["Zelt worker + inspection<br/>core・eventbus・metadataを読む"]
  UI["Studio SPA<br/>v1 schemaを読む"] --> SCHEMA["共通JSON schema<br/>TS/Node/Zeltへのruntime依存なし"]
  CORE --> SCHEMA
~~~

| 箱 | 変更予定の場所 |
| --- | --- |
| config・生成入口 | packages/cli/src/studio/extraction/run.ts、config.ts。既存studioコマンドにextractを追加。既存serverは置き換えない |
| TS索引・値追跡 | 同ディレクトリのindex.ts、origin.ts。metadataの既存解決処理は再利用可能な箇所だけ移植／共通化し、公開inspect APIは維持 |
| pluginと組立 | plugins/zelt.ts、vitest.ts、libraries.ts、requests.ts、assemble.ts。Zeltのruntime importはworker.ts内だけ |
| JSON契約 | 同ディレクトリのschema.ts。Valibot schemaを正とし、公開型はInferOutputで生成。ブラウザ用exportにTS/Node importを混ぜない |
| Zeltの読取API | [HTTP feature](../../packages/core/src/features/http/http.feature.ts)、[routing metadata](../../packages/core/src/features/http/routing/routing-metadata.lib.ts)、[eventbus feature](../../packages/eventbus/src/eventbus.feature.ts)、[class source](../../packages/decorator-metadata/src/inspect/class-source.lib.ts)。登録規則をruntimeと共有する |

schemaはCLIの専用subpathからexportし、UIはそこだけimportする。現在の[src/snapshot-schema.lib.ts](src/snapshot-schema.lib.ts)をそこへ移し、coreとUIで二重管理しない。UIへのビルド時依存であり、静的配信時にCLIやNodeは不要。

### L. UIの追従

実装するpolicy: P4（並び順・y座標をUIで計算）、P1（変えるのは削除・hints置換・e2eTests移動への追従と、4.10・4.11の表示の追従だけ）。

| 変更 | UIで変える場所 |
| --- | --- |
| schema | [snapshot-schema.lib.ts](src/snapshot-schema.lib.ts) に[付録A](#a-出力の形)の差分を反映 |
| `expandedY` 削除 | [layout.lib.ts](src/layout.lib.ts)。列内のgroupをcallsのトポロジカル順（呼ぶ側が上、同順位は名前順）に並べ、y＝上端＋先行groupの現在の高さ＋gapの累積。高さの計算は既存の宣言・tagの寸法を使う。同じ入力と状態では同じ位置になり、選択による薄表示だけでは並べ替えない |
| `hint` → `hints` | [map-presenter.lib.ts](src/map-presenter.lib.ts)（宣言の補助ラベル）、[presenter.lib.ts](src/presenter.lib.ts)（検索対象の文字列と検索結果の補助表示）、[group-node.tsx](src/views/group-node.tsx)（表示）。labelを出すだけで、providerで分岐しない |
| `redacted` 削除 | UIは既に区別していないので型の追従だけ |
| `origin` 削除 | 参照箇所なし。型の追従だけ |
| `demoScenarios` 削除 | [graph.lib.ts](src/graph.lib.ts)、[presenter.lib.ts](src/presenter.lib.ts)、[map-presenter.lib.ts](src/map-presenter.lib.ts)、[preferences.lib.ts](src/preferences.lib.ts) の参照を外す |
| `entries` 削除: 起点ショートカット | [toolbar.tsx](src/views/toolbar.tsx)の起点select（`root-select`）と種類フィルタ（`EntryFilter`）、[presenter.lib.ts](src/presenter.lib.ts)の一覧作成、[navigation.lib.ts](src/navigation.lib.ts)の `entry.choose`、[preferences.lib.ts](src/preferences.lib.ts)の `entry.filter`、[graph.lib.ts](src/graph.lib.ts)の `entries` 索引、関連する型（`EntryKind`・イベント型）を外す |
| `entries` 削除: チップ | [relations.lib.ts](src/relations.lib.ts)の `isWarp` から「別groupの、入口を持つ宣言へのcallをチップにする」規則を外す。チップは関係の種類（`middleware`・`event`）だけで決める。fixtureでこの規則が効いている線は0本 |
| `e2eTests` の移動 | [test-presenter.lib.ts](src/test-presenter.lib.ts)の `endpointModels` を、http entryではなく宣言の `e2eTests` から読む。見出しの `METHOD path` はentryから取っていたので、出し方は[付録N](#n-実装時に決めること) |
| 注記の複数行 | [group-node.tsx](src/views/group-node.tsx)の `member-hint` を注記ごとの行にし、[layout.lib.ts](src/layout.lib.ts)の行の高さ計算に注記の数を入れる（[4.10](#410-注記は1つずつ行にする)）。ec-backendでは複数の注記は起きない |
| IDの表示 | IDをそのまま出している箇所を名前の表示に替える（[4.11](#411-idは抽出の形式になり古いurlは引き継がない)）。groupの見出し（[group-node.tsx](src/views/group-node.tsx)）、詳細の見出し（[inspector.tsx](src/views/inspector.tsx)）、検索結果（[toolbar.tsx](src/views/toolbar.tsx)）、検索の対象と lock 中の「固定基準」表示（[presenter.lib.ts](src/presenter.lib.ts)）、ミニマップの `aria-label`（[mini-map.tsx](src/views/mini-map.tsx)） |
| 手書きfixture | 自動抽出ができるまでコミットし続ける。UI追従と同時に、上の変更に合わせて形を移す |

維持するもの: middleware / event / config / compositionのtag、表示切替、app.ts非表示、Passive View/Mediatorの構成。

### M. 完了判定

実装するpolicy: P1（今の手触りが保たれることを回帰検証する）。各行は対応するpolicyの受入条件。

文書の型検査だけでは下表を達成したことにならない。実装時には実ソースfixtureからJSONを生成し、最後にブラウザで確かめる。

| 照合する場所 | 受入条件 |
| --- | --- |
| graph全体 | ec-backendのinclude範囲のclass/file/interfaceとmemberを列挙。1関数1宣言、callbackの包含、存在するIDへの参照を検証 |
| 注文取得 | findById→DrizzleService.dbのread、ordersへの `table` 線と `table` 宣言、Orderの型参照。架空のRepository/Portなし |
| 注文作成 | transaction/map等のcallbackが別の宣言で内部の依存を所有。折りたたみ時だけclass/fileへ集約 |
| HTTP / middleware | createEcAppの各routeと適用middlewareを、共通登録規則の期待値と照合。親子mount・skip・同名controller・同class複数mountも別fixtureで検証。route methodに `<METHOD> <path>` のhint |
| config | JwtService→JwtConfig等のproperty/getter依存が残る。config表示を切っても実データは消さない。`src/config/` の原文は `declaration-only` |
| event / lifecycle | OrderHandlersの購読callbackと同じbusのemitを結ぶ。別busの同名eventは結ばない。lifecycle登録の注記を残す場合、付くのは登録を確認したstartup/shutdownだけ |
| hints | [付録A](#注記の付与規則全表)の表のlabelが該当宣言に付き、pluginを外すとそのproviderのhintだけが消える |
| Unit | JwtService.signの直接callを持つ4caseを一覧化。各setupのtarget由来とconfig差替えを保持し、joseをoverridesへ入れない |
| E2E | 静的なdirect/helper requestを、同じappでmethod・pathが一致するrouteを登録したmethodの `e2eTests` へ付ける。動的URLや共有hookの不足はpartialとして見える |
| 任意plugin | Zelt無効でもTSの箱・ID・read/callは同じで、[付録A](#pluginが無いときの汎用値全表)の汎用値に落ちる。appをimportしない。runner差替えの共通契約を偽pluginで検証 |
| 再現性と失敗 | plugin順を変えてbyte一致。不正ID/別revision/競合/worker失敗/required不足でpublishせず旧ファイルのhashが変わらない |
| Studio | 生成JSONをfetchし、今の手触り（選択近傍・双方向の独立再帰・lock・折りたたみ・可視tagだけの高さ・Unit/E2E一覧・reload）が保たれることを回帰検証。差分は[4.1](#41-v1からの変更は7点だけ)の変更点（起点ショートカットの削除を含む）と、[4.10](#410-注記は1つずつ行にする)・[4.11](#411-idは抽出の形式になり古いurlは引き継がない)の表示の追従だけ |

実装順は依存する箱に沿って、schema（v1差分）＋UI追従＋fixture移行 → 索引 → plugin＋inspection → 組立/publish → 生成JSONへ切替。各箱の契約テストを先に置く。Vitest以外のrunner、任意JSの実行結果推定、testのin/out値収集、外部plugin配布は初版の完了条件に含めない。

### N. 実装時に決めること

policyの範囲内で、実装しながら詰めればよいもの。policyレベルの判断が要るものは残っていない（[5節](#5-未決)）。

| 項目 | 内容 | 関係するpolicy |
| --- | --- | --- |
| contractに含める外部interface | [4.8](#48-contractは呼んだ先がinterfaceのmemberかで引く)の規則は、外部ライブラリのinterface（better-sqlite3の `Database.exec` など、ec-backendで3件以上）にも当たる。これらも破線にするか、範囲を詰める | P2・P3 |
| `schemaVersion` | 1のまま据え置くか上げるか。UIとfixtureを同時に更新するので旧形式の互換読みは要らない | P1 |
| `event-type` の汎用値 | [付録A](#pluginが無いときの汎用値全表)の `signature` は、`order:created` がinterface memberであることからの推定。TS索引が実際に何の種別を返すかを確かめる | P3 |
| lifecycle登録の注記 | 入口としては消えた。注記として残すか、残すなら事実だけで作る文言（fixtureの `lifecycle · 購読を登録` は人の説明を含む） | P2 |
| E2E一覧の見出し | 今はentryの `METHOD path` を見出しにしている。宣言の `e2eTests` からは取れないので、宣言名にするか注記のlabelを使うか | P4 |
| write / setter / enum | 代入（write）はv1のrelation kindに無い（手書きfixtureでは `this.unsubscribes = []` もreadとして載っている）。setter・enumはv1の宣言kindに無い（ec-backendのsrcでは未発生）。readへ畳むか等 | P1・P2 |
| 動的なtest名 | v1の `TestIdentity.name` / `suite` はnullを許さない。静的に解けないeachのtemplate等の出し方 | P6 |
| setupを照合できなかったcall | v1では各callに `setup` が必須で、`UnitSetup` はfactory callの `targetClass` と `location` を要求する。factoryを使わない・由来が解けないcallを何として出すか | P6・P7 |
| 並び順の循環 | 相互callの扱い。展開class内のmember順も同じ既存決定の対象だが、現mockはmembersの配列順で並べており、今回の追従に含めるか | P4 |
| 手書きfixtureの `hints` 移行 | fixtureの `hint` を `hints` へ移すときの中身。人の説明文を残すか、pluginが付けるはずのlabelだけに絞るか、providerを何と書くか | P2 |
| config例の列 | [付録H](#h-config)の例は5列で、現fixtureの6列（`Port / interface`・`Config` を含む）と一致していない。fixtureの列に揃えるか | P5 |

### O. 今は扱わないもの

v1の形では表せないが、今は扱わないもの。構造変更を提案する場合は「手触りを保つ理由」と「汎用化に効く理由」の両方を書くこと（P1の採用条件）。この文書では、4.1に挙げたもの以外の構造変更は提案しない。

| 項目 | v1で表せない点 | ec-backendで発生するか |
| --- | --- | --- |
| overload / declaration merge | `source.location` と `signature` が単数 | 未発生 |
| 複数app / 複数bus | relation・`e2eTests` にapp・busの区別が無い | 未発生 |
| CLI / schedulerからの呼出 | route以外の外からの呼出を表す置き場が無い（`entries` は廃止）。関数名から推測もしない | 未発生 |
| `UnitSetup` の形 | Zeltの `createTestTarget` を写した形（targetClass・configs・overrides）で、他のDI・test基盤のsetupを表せない | ec-backendはZeltなので問題にならない |
| partialの理由の置き場 | coverageはstatusだけで、何が取れなかったかを載せる場所が無い（報告はCLI出力にだけ残る） | 発生している。理由表示は手触りの変更なので、やるならmockが先 |
| testのskip / only / todo | `TestIdentity` に置き場が無い | 置き場なし |
| 列の中のサブレイヤー | 列の中をconfigのglob（例 `**/*.lib.ts`）で分ける置き場が無い。`requireUser`（`entry/controllers/current-user.lib.ts`）は入口ではなくEntry層のutilだが、今はcontrollerと同じ列に並ぶ。見た目の変更なので次のmockの課題。できたら「入口層へのcallをチップにするか」を再判断する（今Entry列を基準にチップ化すると `requireUser` への9本がチップになり手触りが変わるので、採らない） | 発生している（Entry列のutil） |

### P. 確認状況

2026-09-23時点。

確認したこと:

- v1の型は `src/snapshot-schema.lib.ts` と照合した。[付録A](#a-出力の形)の差分以外は変えていない。
- 手書きfixture（41 group・157宣言）: hintは宣言に157件・groupは全件null。excerptは `code` 126・`declaration-only` 41・`redacted` 31で、`redacted` はすべて `src/config/` と参照先packageのconfig。relation kindに `write` は無い。`contract` はCartService → KVStore（interface）の6本。
- 3節の `AuthController.register` は、実コード（auth.controller.ts 13〜19行）とfixtureの該当宣言（call 1本・middleware 4本・schema 1本・http entry 1件・hint `POST /api/auth/register`・`expandedY` 70）を照合した。fixtureのgroupにparameter propertyの宣言は無い。
- `expandedY` を読むのは `layout.lib.ts` だけ。`hint` を読むのは `presenter.lib.ts`・`map-presenter.lib.ts`（表示は `group-node.tsx`）。`demoScenarios` を読むのは `graph.lib.ts`・`presenter.lib.ts`・`map-presenter.lib.ts`・`preferences.lib.ts`。`presentation.origin` の参照は無い。
- ec-backendのsrcにsetter・enumは無い。
- `entries` を読むのは `graph.lib.ts`（索引）・`presenter.lib.ts`（起点select）・`navigation.lib.ts`（`entry.choose`）・`test-presenter.lib.ts`（E2E一覧）・`relations.lib.ts`（`isWarp`）。`isWarp` の入口規則でチップになる線はfixtureで0本。Entry列を基準にすると `requireUser` への9本がチップになる。fixtureのE2E caseは延べ20件で、すべてhttp entryの中にある。
- 4.8〜4.11（旧5節）の件数: contract線6本の両端。ec-backendのsrc（test除く）のparameter propertyはTS Compiler APIで数えて10 class・14件、それを読む組は延べ36（入れ子関数を外側に含めた数）。付録Aの注記規則で2つ以上付く宣言は無い。URLに保存するのは `node`・`root`・`mode`・`tab` で、未知IDは通知を出して初期表示のまま（e2e testあり）。

未検証: 型ブロックと設定例の型検査（配信型の差分ブロックはv1の型を前提にしており単独では検査していない）、Mermaidの描画（構文はmermaid 11.17.0のparseで確認済み）、読みやすさのユーザー評価、抽出器とUIの動作。受入条件はすべて未検証。
