# Studio抽出設計 — 手書きsnapshotを実コードから生成する

## 0. やりたいこと・前提

この節では、何を作るかと、作業の前提を決める。前提はpolicy（2節）ではなく、この作業の枠。

いまのStudio mockは手書きの `public/ec-backend.snapshot.json` を読んで地図を出している。これを **`zelt studio extract` が実コードから生成したJSONに置き換え、今のStudioにそのまま読ませる**。完了の定義は「ec-backendから `zelt studio extract` でJSONを生成し、そのJSONをStudioで表示できること」。受入条件は[付録M](#m-完了判定)。

- **前提1 — 手触りは変えない**: 配信データの契約は現行v1（[`src/snapshot-schema.lib.ts`](src/snapshot-schema.lib.ts)、説明は[react-migration-design.md](react-migration-design.md)の「fetchするデータ」節）。v1からの変更は[4.5](#45-v1からの変更)に挙げたものだけ。形を変える提案は「手触りを保ち、かつ汎用化に効く」と示せたときだけ受け入れる。
- **前提2 — 汎用化は抽出器の内部構造の話**: 抽出器を「コア（どのTSコードにも効く）＋任意plugin（Zelt・Vitest・Valibot・Drizzle等の意味）＋組立」に分ける。pluginは付与するだけで、無くても同じ型で地図は出て、意味が粗くなるだけ。
- **前提3 — 手書きfixtureは残す**: 手書きの `snapshot.json` は、自動抽出ができるまでコミットし続ける。fixtureをこの計画に合わせて直すのは別作業で、この文書は直す必要のある箇所を示すだけ（[付録L](#l-uiの追従)）。
- この文書は設計のみ。抽出器・UIのコードはまだ変更しない。

**読み方**: 1節は箱の責務、2節のpolicyが土台。3節はpolicyが1本の例でどう効くかの確認、4節はpolicyから決まる結果、5節は判断が要ること（保留中の5件と、policyに根拠が無い項目の一覧）。付録は実装の細則でレビュー不要。

## 1. 全体の箱

この節では、抽出器を構成する箱の責務と、JSONのどこを誰が書くかを示す。矢印はデータの受渡しで、アプリ内の依存を描いた図とは別物。

**処理の形**: コアと各pluginが**材料**を出し、**組立**が1回でJSONを作る。pluginはJSONに触らず、コアの結果を読んで材料を返すだけ。

~~~mermaid
flowchart LR
  S["実コード"] --> CO["抽出器のコア"]
  CO -->|読む| ZP["Zelt plugin"]
  CO -->|読む| VP["Vitest plugin"]
  CO -->|事実| AS["組立"]
  ZP -->|材料| AS
  VP -->|材料| AS
  CF["config"] --> AS
  AS --> J["配信JSON"]
  J --> UI["UI"]
~~~

Valibot・Drizzleのpluginも、Zelt・Vitestと同じ形でコアを読み、材料を組立に渡す。

| 箱 | 責務 | 責務でないこと | 担う② |
| --- | --- | --- | --- |
| config | 人の意図: 境界（列）、気にするライブラリ、地図に載せる範囲、原文を見せる範囲 | コードの事実を書き足すこと | ②3 意図と事実を重ねる、②2 ライブラリは接点だけ |
| 抽出器のコア | TSとして確かめられる事実だけ: 宣言、呼ぶ・読む・型、所在と原文 | どのフレームワークの意味も知らない | ②1 責務と流れ（配線・契約）、②4 コードと一致 |
| plugin | 担当ライブラリの意味を付与する（下の付与の種類） | 他pluginの結果の書き換え、事実の書き換え、コードに無いものを作ること | ②1 責務と流れ（配線・検証）、②4 コードと一致 |
| 組立 | コアとpluginの材料を1枚の地図にまとめる。矛盾があればall or nothingで止める | 分からないことを「無い」に変えること | ②4 コードと一致 |
| UI | 見せ方: 並び、流れのたどり方、隠す・畳む、付与された意味の表示 | データに表示用の値を持たせること | ②1 責務と流れ |

**pluginが付与するもの**: pluginは付与だけをする。コアが出した事実を書き換えない（「読む」を「登録」に置き換える、宣言の種類をschemaにする、といった意味の変換はしない）。

- **意味**: 既存の線や宣言に意味を付ける。`on()` に渡した関数への「読む」にZeltが「登録」を、Valibotが宣言に「schema」を付ける。
- **線**: TSに根拠の無い関係を新しい線として付ける。middleware、event、appへの登録。
- **注記**: 宣言の横に出す短いラベル（`POST /api/auth/register` など）。
- **testの対応の材料**: Vitestのtest名・直接呼んだ関数、Zeltのtestのsetupの差し替え。組立が突き合わせてUnit・E2Eの一覧を作る。
- **setup**: 流れとは別種の情報。constructorとdecoratorの内容（inject、`@UseMiddleware`、Configの差し替え等）。地図の線にはせず、詳細パネルで見せる。

**JSONの書き手**: JSONの各部分は、書き手が1つに決まっている。組立は、コアの事実・pluginごとの材料の一覧・configを受け取り、この対応どおりに組み立てる。

| JSONの部分 | 書き手 |
| --- | --- |
| 列・project | config |
| 箱・宣言・原文 | コア |
| 呼ぶ・読む・型・契約の線 | コア |
| 意味・付与された線・注記・setup | plugin |
| Unit / E2E一覧・取得状況・全体ID | 組立 |

2つのpluginが同じ対象に食い違う材料を出したら、組立は矛盾として生成を止める（all or nothing）。

以降で使う言葉は4つ。

- **事実**: コードを読めば誰がやっても同じになるもの（「AがBを呼ぶ」「このmethodは `POST /api/auth/register` のrouteに登録されている」）。
- **意味**: 事実のうち、ライブラリやフレームワークを知って初めて分かるもの（「この値はValibotのschema」）。pluginが確かめて付与する。
- **注記**: 宣言の横に出す短いラベル。pluginが自分の見つけた事実から付ける。
- **列**: 地図の横位置（`Entry / Middleware`・`Use case` など）。どのファイルをどの列に置くかは、人がconfigのglobで決める。

## 2. Policy

この節は「地図は何のためにあり、何を表すか」に答える。policyはここに書く①と②だけで、抽出の仕組み（how）・規則・見せ方は4節で②に紐づけて示す。

**① 目的**: 巨大なコードベースを、アーキテクトが理解・設計できる粒度まで圧縮して見せる。

**アーキテクトの問い**（①から出る。新人の「この変更は安全か」ではなく、構造の問い）:

- Q1 この処理は、どの責務をどの順に通るか
- Q2 流れは境界を意図どおりの向きで越えているか
- Q3 どこが契約で切られ、どこが直結しているか
- Q4 外界（DB・ネットワーク等）への依存は、決めた層に閉じているか
- Q5 ライブラリを、どの責務がどう選び、活用しているか
- Q6 責務は、どの境界で検証されているか

**② 地図が表すもの**:

1. **責務と流れ**: 地図が表すのは、このプロジェクトの責務と、責務どうしが協調して1つの処理を実現する流れ。流れは、契約（型・interface）、配線（呼ぶ・渡す）、検証（test）で表す。（Q1・Q2・Q3・Q6から）
2. **ライブラリは接点だけ**: ライブラリにこのプロジェクトの責務はない。地図に出すのは、プロジェクトがライブラリをどう選び、活用しているかという接点だけ。（Q5から）
3. **意図と事実を重ねる**: 「流れが境界を意図どおりに越えているか」を問うには意図された境界が必要。境界（層・列）はアーキテクトの意図なので人が書き、流れはコードの事実から取る。地図はこの2つを重ねて見せる。（Q2・Q4から）
4. **コードと一致する**: アーキテクトは地図を見て構造を判断するので、地図が実際のコードと違えば判断を誤る。確かめられないものは載せない。分からないことは分からないと見せる。（すべての問いの前提）

~~~mermaid
flowchart LR
  subgraph Q["アーキテクトの問い(① 目的から)"]
    Q1["この処理は、どの責務を<br/>どの順に通るか"]
    Q2["流れは境界を<br/>意図どおりの向きで越えているか"]
    Q3["どこが契約で切られ、<br/>どこが直結しているか"]
    Q4["外界への依存は、<br/>決めた層に閉じているか"]
    Q5["ライブラリを、どの責務が<br/>どう選び、活用しているか"]
    Q6["責務は、どの境界で<br/>検証されているか"]
  end
  A["② 責務と流れ"]
  B["② ライブラリは接点だけ"]
  C["② 意図と事実を重ねる"]
  D["② コードと一致する"]
  Q1 --> A
  Q2 --> A
  Q3 --> A
  Q6 --> A
  Q2 --> C
  Q4 --> C
  Q5 --> B
  Q -->|すべての問いの前提| D
~~~

**外界とライブラリは別物**: アーキテクチャ上の「外界」はDB・ネットワーク等で、adapter層がその接点（Q4）。ライブラリはnode_modulesの既製の部品（Q5）。ライブラリを別の列に置く理由は「責務が違う」ことで、ライブラリにこのプロジェクトの責務は無く、プロジェクトの責務はライブラリを選び適切に活用すること。この文書ではnode_modules側を「ライブラリ」と呼ぶ（ec-backendのconfigの列名「外部」の変更提案は[4.2](#42-ライブラリは接点だけから)）。

以降、②の各項を「②1〜②4」と書く。

## 3. 1本の例で見る

この節は「②は実際のコードでどう効くか」に答える。題材はec-backendの会員登録API、`AuthController.register`。

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

### 各箱が何を出すか

~~~mermaid
flowchart LR
  S["実コード<br/>AuthController.register"]
  T["コア"]
  P["plugin"]
  A["組立"]
  U["Studio"]
  S --> T
  T --> P
  T --> A
  P --> A
  A --> U
~~~

| 箱 | registerについて出すもの | 満たす② | 答える問い |
| --- | --- | --- | --- |
| コア | `AuthService.register` を呼ぶ線、`RegisterSchema`（変数）を読む線 | ②1 配線、②4 事実だけ | Q1 |
| plugin:zelt | 注記 `POST /api/auth/register`、middlewareの線4本、setup `@RateLimit` | ②1 処理の入口と配線 | Q1・Q2 |
| plugin:valibot | `RegisterSchema` を読む線に、schemaの意味を付与 | ②2 ライブラリの活用 | Q5 |
| 組立 | 材料を1枚にまとめ、E2E testをrouteの一致で付ける。矛盾があれば止める | ②1 検証、②4 | Q6 |
| Studio | Entry列（configのglob）に置き、列と線を重ねて描く | ②3 | Q2 |

- `register` がどのURLのrouteに登録されているかは、TSだけでは分からない。plugin:zeltが、Zeltが実行時に持つroute・middlewareの登録情報を読んで付与する（②4: 確かめた事実だけ）。middlewareは、app.tsで登録したLogging、core組込みのCors・SecureHeaders、`@RateLimit` が内部で付けるRateLimitの4本。
- 線にしないもの: `this.authService` の読み取り（注入された値の置き場は責務ではない）。`@RateLimit`・`@Post` のdecoratorと `inject(AuthService)` はsetupで、詳細パネルに出す（[4.1](#41-責務と流れから)）。`request(…)` の呼出が線になるかはホワイトリストの単位次第（[5.5](#55-setupと流れの境目)）。

### 手書きfixtureとの対応

`public/ec-backend.snapshot.json`（手書きfixture）の `AuthController.register` と照合した結果。

| fixtureにあるもの | 抽出ではどうなるか |
| --- | --- |
| `AuthService.register` へのcall | 同じ（コア） |
| `RegisterSchema` へのschema線 | 見え方は同じ。データはTSの「読む」＋valibotが付与したschemaの意味になる（[4.5](#45-v1からの変更)） |
| middleware線4本 | 同じ（plugin:zeltが付与する線） |
| 注記 `POST /api/auth/register` | 同じ（plugin:zeltがrouteから付ける） |
| E2E一覧（宣言に直接付く）。fixtureは「未収録」 | 置き方は同じ。ただしconfigのE2E範囲は `product.spec.ts` のサンプリングなので、状態は「一部のみ・0件」になる（[4.4](#44-コードと一致するから)）。fixtureは直す必要がある |
| `this.authService` を読む線（fixtureに無い） | 無いまま（[4.1](#41-責務と流れから)） |

抽出に切り替えると、`AuthController.register` という短いIDは抽出の形式に変わる（[4.6](#46-policyに根拠が無い結果)）。

### pluginを外すと

Zeltのpluginを外すと、middleware線・注記・setup・E2E testの結び付きが消え、`register` は「AuthServiceを呼ぶmethod」としてだけ残る。Valibotのpluginを外すと、schemaの意味が付かず、線は「読む」と表示される。確かめられない意味は出さず、地図の形は同じまま粗くなるだけ（②4、前提2）。

E2Eで同じappに `POST /api/auth/register` を送るtestがあれば、そのtestは、このrouteを登録した `register` に付く。結ぶ根拠は、testが送るmethod・pathと、plugin:zeltがroute登録から取ったmethod・pathの一致。`AuthService.register` には付かない（②1 検証: そのtestが直接試した境界はrouteだけ）。

## 4. Policyから決まること

この節は「②を決めると、何がどう決まるか」に答える。4.1〜4.4は②の各項から決まる結果で、各項目の見出しに「← ②の何番（問い）」を付ける。4.5はv1からの変更、4.6は②に根拠が無い結果で、残すかどうかは[5.6](#56-根拠がpolicyに無い項目)で判断する。規則の細部は付録に置く。

~~~mermaid
flowchart LR
  A["②1 責務と流れ"] --> R1["4.1 流れの表し方"]
  B["②2 ライブラリは接点だけ"] --> R2["4.2 ライブラリの載せ方"]
  C["②3 意図と事実を重ねる"] --> R3["4.3 境界の書き方"]
  D["②4 コードと一致する"] --> R4["4.4 確かめ方と止め方"]
  F["前提1 手触り"] --> R5["4.5 v1からの変更"]
  R6["4.6 ②に根拠が無い結果"] -.->|判断| J["5.6"]
~~~

### 4.1 責務と流れから

②1は「流れは契約・配線・検証で表す」と決めた。ここから、どの線を引くか、何を線にしないか、testをどこに結ぶかが決まる。

#### 配線: 呼ぶ・読む・渡す ← ②1（Q1・Q2）

- **呼ぶ・読む**: コアが引く。「読む」はproperty・getter・変数と、値として渡した関数・method（無名callbackでも名前付きでも）。
- **登録の意味**: eventbusの `on()`・`once()` に渡した関数への「読む」に、plugin:zeltが「登録」の意味を付与する。線はコアの「読む」1本のままで、表示は「登録」。
- **付与された線**: TSに根拠の無い配線は、plugin:zeltが新しい線として付ける。middlewareの適用、eventの配送、appへの登録（`controllers: [X]` 等。ec-backendでは `createEcApp` から9本）。
- **classを値として渡す式**: `inject(X)`・`@UseMiddleware(X)`・`controllers: [X]` はコアの線にしない。その意味は、setup（下）か付与された線として出る。この規則は②に根拠が無い（[5.6](#56-根拠がpolicyに無い項目)）。

規則の細部は[付録B](#線の取得規則)・[付録D](#d-zelt)。

#### 契約: interfaceと型 ← ②1（Q3）

- **contract**: 呼んだ先の宣言がinterfaceのmemberなら、コアがそのcallを `contract`（地図では破線）として出す。TSの事実だけで決まり、pluginに依存しない。ec-backendでは `CartService` → `KVStore` の6本。
- **戻り値は型で表す**: 戻り値に関する線は、戻り値の型の宣言でも関数を返す場合でも「型」（`type`）の線にする。「関数を返す」（`returns`）を別の線の種類にしない。fixtureの `EcJwtConfig.resolveUser` → `@callback:0` の `returns` 1本は外す（別作業）。

~~~mermaid
flowchart LR
  subgraph CS["CartService"]
    CT["constructor<br/>store = kv.namespace('cart:')"]
    GC["getCart<br/>this.store.get(…)"]
  end
  KV["KVStore（interface）<br/>get"]
  GC -->|contract| KV
~~~

#### setup: 流れとは別に、詳細で見せる ← ②1（Q1）、②4

constructorとdecoratorの内容（`inject(AuthService)`、`@UseMiddleware(X)`、`@RateLimit(…)`、Configの差し替え）は、処理の流れではなく部品の組み方（setup）。

- 地図の線にしない。②1が描くのは流れだけ。
- 消さない。コードの事実なので（②4）、plugin:zeltが宣言やgroupに付与し、詳細パネルで見せる。9/6の決定「注入は地図に描かないが、詳細には事実として残す」と同じ。
- 注入された値の置き場（constructorのparameter property）は宣言にせず、途中の `this.authService` の読み取りも線にしない。流れは `AuthService.register` を呼ぶ線1本で表せる。
- 詳細パネルの見せ方は今のmockに無いので、mockで先に示す（[付録L](#l-uiの追従)）。

#### 検証: testの結び方 ← ②1（Q6）、②4

testは、そのtestが直接触った境界にだけ結ぶ。間接的に届いた関数まで「このtestが検証している」とは言えない（②4）。

- **Unit**: case本文が直接呼んだ関数に付ける。呼んだ先の、さらに先には伝播させない。
- **E2E**: testが送ったrequestのmethod・pathと、plugin:zeltのroute登録のmethod・pathが同じappで一致したとき、そのrouteを登録したmethodに付ける。
- **結ぶのは組立**: Vitestとplugin:zeltはそれぞれ対応の材料を出すだけで、互いを知らない。組立が突き合わせる。細部は[付録F](#f-unit)・[付録G](#g-e2e)。

#### 注記: 処理の入口と配線を示す ← ②1（Q1）、②2（Q5）

注記は、pluginが自分で確かめた事実からだけ付ける（②4）。1つの宣言に複数pluginが付けたら、並ぶだけで衝突しない。

| plugin | 注記の例 | 示すもの |
| --- | --- | --- |
| zelt | routeを登録したmethodに `POST /api/auth/register`、event購読に `EVENT order:created` | 処理の入口と、eventで続く流れ（②1） |
| zelt | DIで作るclassとConfigのconstructorに `DI / 初期化`、core組込みmiddlewareの `use` に `全HTTP · core自動登録` | 配線の場所（②1）。後者はライブラリが流れに足す部品（②2） |
| drizzle・valibot | table宣言にtable名、そこから作った型に `DB schema由来`、schemaから作った型に `InferOutput<RegisterSchema>` | ライブラリの活用（②2） |

全規則は[付録A](#注記の付与規則全表)。

### 4.2 ライブラリは接点だけから

②2は「ライブラリにこのプロジェクトの責務はなく、出すのは選び方と活用の接点だけ」と決めた。ここから、どのライブラリを載せるか、箱の中身・置き場所・testの扱いが決まる。

#### 載せるライブラリは、本人がconfigで選ぶ ← ②2（Q5）、②3

- ライブラリは「アーキテクトが気にするもの / 気にしないもの」で分ける。どれを気にするかは本人のレベル次第なので、本人がconfigのホワイトリストで選ぶ（②3: 意図は人が書く）。
- honoのように十分に認知され関心を持たないものは、見えるべきでない（②2: 出すのは気にする接点だけ）。Node標準・TS標準も載せない。
- ホワイトリストに無い相手への線は引かず、未解決欄にも載せない。Zeltのパッケージも他のライブラリと同じ扱い。
- ec-backendでは `@zeltjs/core`・`auth-jwt`・`kv`・`eventbus`・`rate-limit` を選び、drizzle-orm・better-sqlite3・jose・honoは載せない。選ぶ単位（packageかexportか）は[5.5](#55-setupと流れの境目)、書き方は[付録H](#h-config)。

#### ライブラリの箱は、使うメンバーだけをライブラリ列に並べる ← ②2（Q5）

- 箱に並べるのは、アプリのコードから直接参照されているメンバーだけ（「内部未展開」の表示）。箱の中から出る線は辿らない。
- ライブラリのファイルは右端の1列にまとめる。configの列ルールで表す。ec-backendのconfigの列名「外部」は外界（DB・ネットワーク）と混同を招くので、「ライブラリ」への変更を提案する（configファイルは今回変更しない）。
- ec-backendの手書きfixtureでは、ライブラリの箱は12個（メンバー計18）。

#### ライブラリの活用は、意味の付与で見せる ← ②2（Q5）、②4

- plugin:valibot・plugin:drizzleは、定義元のSymbolで確かめたときだけ、宣言とそれを読む線に `schema`・`table` の意味を付与する。「どの責務がライブラリをどう使っているか」が線の表示で見える。
- ホワイトリストに入れていないライブラリ（drizzle-orm・valibot）でも、pluginを有効にすれば活用は意味として出る。箱は出ない。

#### ライブラリ自身のtestは収録しない ← ②2

ライブラリにこのプロジェクトの責務は無いので、その検証も地図に出さない（JwtServiceのUnit testなどは入れない）。

### 4.3 意図と事実を重ねるから

②3は「境界は人が書き、流れはコードの事実から取り、重ねて見せる」と決めた。ここから、configが書くものと書かないものが決まる。

#### 列とroleは、人がconfigのglobで決める ← ②3（Q2・Q4）

- 列（境界）はアーキテクトの意図。どのファイルをどの列に置くか、role（`config`・`composition`）を、configの順序付きglobで決める。抽出器は推測しない。
- 列の有無もconfig次第。ec-backendの例は空になる列（`Port / interface`）を置かない。
- roleの決め方は9/6の決定と食い違う（[5.2](#52-roleの決め方)）。

#### 入口はEntry列にいる宣言。`entries` を持たない ← ②3

- 入口はEntry列（人がconfigで決める配置）にいる宣言のことで、別の一覧を持たない。HTTPのmethod・pathは注記に、E2E一覧は宣言に移る。
- 起点ショートカット（右上のselectと種類フィルタ）はmockから外す（ユーザー判断）。lifecycleの入口も一緒に消える。

#### 地図に載せる範囲は、configで決める ← ②1、②3

- `include` は「このプロジェクトのコード」の範囲。②1の「このプロジェクトの責務」がどこまでかを人が指定する。
- アプリのtestファイルはコアの索引には入るが、箱にはしない。testは検証として宣言に結ぶ（②1）。

#### 流れは事実からだけ取る。configで線を足さない ← ②3（Q2）

configは境界だけを書き、線の手入力はできない。意図と逆向きに境界を越える線は、そのまま地図に出る。

### 4.4 コードと一致するから

②4は「確かめられないものは載せない。分からないことは分からないと見せる」と決めた。ここから、事実と意味の分担、分からないときと矛盾したときの扱いが決まる。

#### 事実はコア、意味はpluginが付与する ← ②4、前提2

- 宣言・線・包含・所在はコアがTSから取る。どのTSプロジェクトでも取れる事実。
- 意味は、pluginが定義元のSymbolやZeltのruntime metadataで確かめたときだけ付与する。名前・接尾辞の見た目で判定しない。
- pluginはコアの事実を書き換えない。付与するだけなので、pluginを外せばそのpluginの付与だけが消え、事実は同じまま残る。

| pluginが無いとき | 対象 |
| --- | --- |
| TSの種類で表示される | 意味が付かない線・宣言。schema・tableは「読む」・「値」、登録は「読む」。contractはコアの事実なので残る |
| 出なくなる | 付与された線（middleware・event・appへの登録）、setup、注記、test一覧 |

#### 分からないものは、分からないと見せる ← ②4

- 解けなかった参照は、v1の「未解決」欄に理由付きで残す。偽の宣言を作って線をつなげない。
- 取りきれなかった範囲は、test一覧の取得状況を「一部のみ」にする。取っていないものを「0件」や「なし」と見せない。
- **E2Eのサンプリング**: ec-backendのconfigのE2E範囲は `product.spec.ts` だけ（手書きの手間を減らすサンプリングで、抽出できないから外したのではない）。productを送らないrouteは「一部のみ・0件」で、「未収録」ではない。fixtureは直す必要がある（別作業）。
- **Unit**: ec-backendに実際のUnit testを12ファイル・約212 case追加済み（未コミット）。fixtureは未反映（別作業）。

#### 生成はall or nothing ← ②4

- 事実や材料が矛盾したら（例: 同じroute登録に2つの異なるmethod・path）、どちらかを採らずに生成を止める。
- 結果は「前回のJSONを残す」か「前回も無く、今回も生成しない」のどちらか。部分的な地図は出さない（ユーザー判断）。今の「失敗したら前回を残す」はこれを満たす。
- 解析中に入力が変わったら止め、異なる版を混ぜない。同じ入力なら、pluginの順を変えても同じJSONになる。

#### コードに根拠の無い値は外す ← ②4

- 人の説明文だった `hint`（約60件）は消え、pluginが確かめた注記（`hints`）だけが残る。
- `demoScenarios`（仮の変更）は外す。変更はdiffで表すもので、コードの事実ではない。
- URLに保存したIDが今の地図に無ければ、通知を出して初期表示にする。別の宣言を黙って選ばない。

### 4.5 v1からの変更

前提1より、v1の形を変えるのは、コードに根拠の無い値の除去・移動と、論証付きの構造変更だけ。型の差分は[付録A](#a-出力の形)。

**構造の変更（2026-09-24、ユーザー判断）**: 線と宣言の種類には、TSの事実だけを持たせる。

| v1の今 | 変更後 |
| --- | --- |
| 線の種類に、TSの事実（call・read・type 等）とライブラリの意味（register・schema・table・middleware・event）が混ざっている | 線の種類はTSの事実だけ（call・read・type・construct・extends・implements・override・contract）。ライブラリの意味は、付与された意味としてprovider付きで別に持つ |
| 宣言の種類に、ライブラリの意味（schema・table・event-type）が混ざっている | 宣言の種類はTSの種類だけ。ライブラリの意味は、付与された意味として別に持つ |
| middleware・event・appへの登録も、線の種類の1つ | 付与された線として、provider付きで持つ |
| constructor・decoratorの内容の置き場が無い（原文と注記 `DI / 初期化` でだけ見える） | setupとして、group・宣言にprovider付きで持つ |

- **手触り**: UIは、付与された意味があればそれ（「登録」「schema」等）を、無ければTSの種類を表示する。今の地図の見え方は変わらない。setupは詳細パネルの表示が増えるだけで、地図は変わらない（見せ方はmockで先に示す）。
- **汎用化**: 種類からライブラリ固有の値が消え、どのライブラリの意味も同じ付与の形で足せる。新しいライブラリを扱うためにv1の種類を増やさなくてよく、pluginが事実を書き換える必要も無くなる（1節の処理の形）。

**値の除去・移動**:

| v1の値 | 変更 | 根拠 |
| --- | --- | --- |
| `expandedY`（グループの縦位置） | 削除。UIが計算 | ②に無い（[4.6](#46-policyに根拠が無い結果)）。手で決めた座標はコードから作れない |
| `excerpt.kind: 'redacted'` | 削除。configで原文の範囲から外す | ②に無い（[5.6](#56-根拠がpolicyに無い項目)） |
| `presentation.origin` | 削除 | ②に無い（5.6）。UI未使用で `provenance` と重複 |
| `demoScenarios` | 削除 | ②4（仮の変更はコードの事実ではない） |
| `entries`（入口の一覧） | 削除 | ②3（入口はEntry列にいる宣言） |
| `hint`（1つの文字列） | `hints: { provider, label }[]` に置換 | ②4（人の説明文は消える）、②1・②2（注記が示すもの） |
| E2E test一覧（entryの中） | 宣言に直接付ける | ②1（routeを登録したmethodで検証を見せる） |

線の種類の `returns` は出力しない（[4.1](#41-責務と流れから)）。v1の型から外すかは[付録N](#n-実装時に決めること)。

### 4.6 policyに根拠が無い結果

次の結果は②のどれにも紐づかない（見せ方・実装・運用の規則）。「確定」はユーザー判断で決まったもの。それ以外は、残すか、policyを足すかを[5.6](#56-根拠がpolicyに無い項目)で判断する。

- **並び順と座標はUIが計算する（確定）**: 列内のgroupはパスの名前順、同じファイル内はソースの出現順（9/23）。展開したclass内のメンバーと詳細欄のメンバー一覧は、ファイルに書かれた順（9/24、実装済み）。JSON内の配列の順序には表示の意味を持たせない。
- **原文を伏せる範囲はconfig**: 秘密を含みうるファイルは、人がconfigで「原文を出す範囲」から外し、「宣言だけ」の表示にする。ec-backendでは `src/config/` を外す。
- **注記は1つずつ行にする**: 注記が複数付いたら注記ごとに行を増やす。ec-backendでは2つ以上付く宣言は無い。mock更新で示す。
- **IDは抽出の形式になる**: IDは[付録B](#箱の切り方とid)の形。古いURLは引き継がない。IDを画面に出している箇所は名前の表示に替え、検索結果は `Group#func` の表記で注記も横に出す。
- **チップは関係の種類だけで決める**: middleware・eventのチップは、UIが付与された線の種類だけから作る表示。注記には入れない。

## 5. 判断が要ること

5.1〜5.5は保留中の判断で、それぞれ②に照らした推奨を付ける（決定ではない）。5.6は、4節と付録の規則のうち②に紐づかないものの一覧。実装しながら決めればよいものは[付録N](#n-実装時に決めること)にある。

**今回（9/24）の決定で解消したもの**:

- 旧5.1 app.tsの登録の線 → plugin:zeltが付与する線として付ける（[4.1](#41-責務と流れから)）。fixtureの9本は残る。
- 旧5.3 詳細パネルでのDIの見せ方 → setupとして詳細パネルに出す（[4.1](#41-責務と流れから)）。
- 旧5.8のうち4項目 → ホワイトリストの根拠（[4.2](#42-ライブラリは接点だけから)）、生成のall or nothing（[4.4](#44-コードと一致するから)）、並び順（[4.6](#46-policyに根拠が無い結果)）、抽出器の構造（1節の処理の形）。

### 5.1 ライブラリを隠すトグル

**何が起きるか**: 9/6の決定で「地図にexternal非表示オプション」を足すとしたが、今のmockに無い。

- (a) ライブラリの列に付ける。
- (b) 廃止する。

**推奨: (a)、ただし先にmockで示す**。Q1〜Q4はこのプロジェクトの責務の問いで、ライブラリを問うのはQ5だけ。②2でライブラリは責務ではなく接点なので、Q1〜Q4を問うときに接点を隠せると、①の圧縮が一段進む。データは変えず、既存のconfig表示切替と同じ見せ方の切替。mockに無い表現なので、採るなら9/6の決定どおりmockが先。

### 5.2 roleの決め方

**何が起きるか**: 9/6の決定は「役割はdecorator名とファイルの接尾辞だけから決める」。計画はconfigの `src/config/**` のglobで `config` のroleを付けている。

- (a) 決定の文言を「decorator名・接尾辞・人がconfigのglobで指定したもの」に更新する。
- (b) `config` のroleは、plugin:zeltが `@Config` のmetadataから意味として付与する。

**推奨: (b)**。②3で人が書くのは境界（層・列）。「このclassは設定である」は境界ではなくコードの事実で、`@Config` に書かれている（ec-backendの2つと、ライブラリの `JwtConfig`・`CorsConfig` のどれにも付いている）。事実はコードから取る（②4）。付与の枠にもそのまま収まる。代わりに、pluginが無いとroleは全部 `regular` になり、config表示の切替が効かなくなる（粗くなるだけ）。

### 5.3 既存の抽出器との関係

**何が起きるか**: 第1サブプロジェクトの抽出器（`packages/cli/src/studio/` のDependencyGraph v3、9/19のcommit 2bebe064）は、関数単位の呼出・classとライブラリのノード・注入の線（`injects`）・入口・ファイルの接尾辞を出す。出力の形はv1ではない。9/6の決定は「既存を拡張」、この計画は実質「新しいもので置き換え」を前提にしている。

- (a) 新しいもので置き換える。
- (b) 既存を拡張する。

**推奨: 出力は(a)でv1に一本化し、中身は既存を流用する**。②はどちらも決めない。判断材料は、v3が注入を線として持ち（この計画ではsetup）、列（②3）とtest（②1の検証）を持たないこと、7/6の決定「グラフJSONがSSOT」から地図のJSONを2つ持ちたくないこと。v3の呼出解決・子プロセス実行・Programの組立はコアの実装に流用する。

### 5.4 zelt.config.tsとの二重管理

**何が起きるか**: 9/10の決定は「`zelt.config.ts` をProgramの追加rootにする」。ec-backendの `zelt.config.ts` は `app` に `createEcApp` を持つが、抽出configもplugin:zeltのapp factoryとして `createEcApp` を別に書いている。

- (a) plugin:zeltは `zelt.config.ts` の `app` を読み、抽出configには書かない。
- (b) 今の計画どおり両方に書く。

**推奨: (a)**。地図は実際に動くappと一致する必要があり（②4）、2か所に書くと、ずれたときに別のappの地図になる。既存のanalyzerも `zelt.config.ts` の `app` を読んでいる。E2E用の `createTestApp` は `zelt.config.ts` に無いので、抽出configに残る。

### 5.5 setupと流れの境目

**何が起きるか**: setupの枠で、`inject(X)`・`@UseMiddleware(X)` と、`@Controller`・`@Post` などのdecoratorの内容は詳細パネルに移る（[4.1](#41-責務と流れから)）。残る論点は2つ。

1. **ホワイトリストの単位**: `@zeltjs/core` をpackage単位で載せると、`inject`・`request`・`currentUser`・`requestContext` を呼ぶ線と、decorator関数の箱がライブラリ列に出る。手書きfixtureには無い。
2. **constructorの本文**: parameterの既定値（`= inject(X)`）はsetupだが、本文の呼出（`CartService` の `kv.namespace('cart:')`、`DrizzleService` の接続の作成）を流れとして線に残すか。

1について:

- (a) package単位のまま線にする。
- (b) ホワイトリストを「packageのどのexportまでか」まで細かくする（[ec-backend.extract.json](ec-backend.extract.json)の `mapPackages` の提案。`@zeltjs/core` からは `LoggerService`・`LifecycleManager`・`CorsMiddleware`・`SecureHeadersMiddleware`・`CorsConfig` だけ）。

**推奨: 1は(b)、2は線に残す**。1: どれを気にするかは本人が選ぶ（[4.2](#42-ライブラリは接点だけから)）ので、選ぶ単位は細かい方が本人の意図に合う。注意点は、`request(RegisterSchema)` のような「入力をschemaで検証する」活用はQ5の接点そのもので、(b)の提案では地図から消えること。見せたければ `request` をexportsに足す。2: 本文の呼出はTSの事実で、コアはフレームワークを知らないので、既定値とdecorator以外を見分ける根拠が無い。今のfixtureも本文の線を持っている。

decoratorの式をコアの線にしないことは、TSの構文（decorator）で決まり、フレームワークを知らなくてよい。9/24の決定（decoratorの内容はsetup）からの帰結として扱う。

### 5.6 根拠がpolicyに無い項目

4節と付録の規則のうち、②のどれにも紐づかず、まだ決まっていないもの。消すか、policyが足りないかを判断する。

| 項目 | 何の規則か（場所） | なぜ②に紐づかないか | 今の根拠 |
| --- | --- | --- | --- |
| classを値として渡す式を線にしない | コアの「読む」の範囲（4.1、付録B） | ②1は配線（渡す）を流れに含めるので、②からはむしろ線にする方向になる | その意味はsetupと付与された線で出る。コアが線を引くと重複し、pluginは付与しかできないので消せない |
| 原文を伏せる範囲はconfig（`redacted` 削除） | 原文の範囲（4.6、付録H） | 秘密の保護で、地図が何を表すかの話ではない | 運用上の要請 |
| 注記は1つずつ行にする | 見せ方（4.6、付録L） | 見せ方の選択 | 9/23の決定 |
| IDの形式、古いURLを引き継がない、検索の `Group#func` 表記 | 実装と見せ方（4.6、付録B・L） | 実装と見せ方の選択 | 9/23の決定 |
| チップは関係の種類だけで決め、注記に入れない | 見せ方（4.6、付録A・L） | 見せ方と、関係を1か所に持つ設計の原則 | 9/23の決定 |
| `presentation.origin`・`expandedY` の削除 | v1の変更（4.5） | 使われていない重複の整理と、手で決めた座標をコードから作れないという抽出の都合 | 前提（抽出で生成する） |
| v1の形を保つ。構造変更は論証付きの提案だけ | 手触り（0節・4.5、付録L・M・O） | 作業の枠 | 前提1 |
| workerはapp factoryを1回呼ぶだけで、サービスを生成しない。DBやネットワークに接続しないfactoryを入力条件にする | 抽出の実行（付録D） | 抽出を安全に動かすための制約で、地図の内容ではない | 運用上の要請 |

---


## 付録 実装詳細

**ここは4節の結果を実装に落としたもの。レビュー不要。** 各項の冒頭に、実装する②（と前提）を示す。②に紐づかない規則は[5.6](#56-根拠がpolicyに無い項目)に挙げた。

TypeScriptブロックには2種類ある。**配信型**（v1、UIが読む）と、**抽出器内部の型**（配信しない）。内部型のブロックには見出しで「内部」と書く。

| 付録 | 内容 |
| --- | --- |
| A | 出力の形（配信型の差分・各フィールドの書き手・付与と注記の全表） |
| B〜H | 各箱の取得方法（コア・plugin共通・Zelt・Library・Unit・E2E・config） |
| I〜M | 組立・生成・置き場所・UI追従・完了判定 |
| N〜P | 実装時に決めること・今は扱わないもの・確認状況 |

### A. 出力の形

実装する②: ②4（値の出どころは確かめた事実だけ。事実と付与を分けて持つ）、②1・②2（注記・付与された意味と線が示すもの）、②3（列とroleはconfig）。形の変更の論証は[4.5](#45-v1からの変更)。

#### 配信型の差分

| 変更 | 対象 | 理由 |
| --- | --- | --- |
| 分離 | 線の `kind` → TSの種類だけ＋ `meanings` | 線の種類はTSの事実（`call` `read` `type` `construct` `extends` `implements` `override` `contract`）。`schema` `table` `register` は、`read` に付与された意味になる（[4.5](#45-v1からの変更)） |
| 分離 | 宣言の `kind` → TSの種類だけ＋ `meanings` | 宣言の種類はTSの種類（`method` `constructor` `function` `callback` `property` `getter` `signature` `type` `value`）。`schema` `table` `event-type` は付与された意味になる |
| 分離 | 線の `kind` の `middleware` `event` と、appへの登録の `register` → 付与された線 | TSに根拠の無い線。`provider` を持ち、種類はpluginが決める文字列 |
| 追加 | group・宣言の `setup` | constructor・decoratorの内容。地図に描かず詳細パネルで見せる（[4.1](#41-責務と流れから)） |
| 削除 | `GroupPresentation.expandedY` | 並び順とy座標はUIが計算する（[4.6](#46-policyに根拠が無い結果)） |
| 削除 | `excerpt.kind: 'redacted'` | UIはcodeと区別していない（[inspector.tsx](src/views/inspector.tsx)は `declaration-only` か否かだけを見る）。原文を見せたくないファイルはconfigの `sourceText` から外し、`declaration-only` にする |
| 削除 | `presentation.origin`（Map・Group・Declaration） | UI未使用。最上位の `provenance` と重複 |
| 削除 | `MapPresentation.demoScenarios` | 変更はdiffで表すものであり、JSONの1データではない |
| 削除 | `SourceDeclaration.entries`（`EntryPoint`） | 入口はEntry列（configの配置）にいる宣言のことで、別に持たない。HTTPのmethod・pathはplugin:zeltの `hints` に、E2E一覧は宣言の `e2eTests` に移る |
| 移動 | `EntryPoint.e2eTests` → `SourceDeclaration.e2eTests: EndpointTests \| null` | routeを登録したmethodに付く。`null` はrouteを登録していない宣言（plugin:zeltが無いときは全宣言）。`EndpointTests` の形はv1のまま |
| 置換 | `presentation.hint: string \| null` → `hints: { provider; label }[]` | pluginが自分の見つけた事実から付ける注記。複数pluginの付与は配列に並ぶだけで衝突しない。UIはラベルを出すだけでZeltを知らない |
| 維持 | `presentation.columnId`・`role`、`MapPresentation.columns` | 人がconfigのglobで決める配置（②3。roleの決め方は[5.2](#52-roleの決め方)） |
| 出さない | relation kind `returns` | 戻り値に関する線は `type` にする（[4.1](#41-責務と流れから)）。v1の型から外すかは[付録N](#n-実装時に決めること) |

配信型の差分（ここに無いv1の型はそのまま）:

~~~ts
interface Hint {
  readonly provider: string;
  readonly label: string;
}
// 付与された意味。UIはあれば kind の表示名を、無ければTSの種類を出す
interface Meaning {
  readonly provider: string;
  readonly kind: string;
}
type TsRelationKind =
  | 'call' | 'read' | 'type' | 'construct'
  | 'extends' | 'implements' | 'override' | 'contract';
type TsDeclarationKind =
  | 'method' | 'constructor' | 'function' | 'callback'
  | 'property' | 'getter' | 'signature' | 'type' | 'value';
// コアが引いた線
interface TsRelation {
  readonly origin: 'ts';
  readonly id: RelationId;
  readonly to: SubjectId;
  readonly kind: TsRelationKind;
  readonly meanings: readonly Meaning[];
  readonly evidence: readonly RelationEvidence[];
}
// pluginが付与した線
interface GrantedRelation {
  readonly origin: 'plugin';
  readonly id: RelationId;
  readonly to: SubjectId;
  readonly provider: string;
  readonly kind: string;
  readonly evidence: readonly RelationEvidence[];
}
type SourceRelation = TsRelation | GrantedRelation;
// 流れとは別種の情報。地図に描かず詳細パネルで見せる
interface SetupItem {
  readonly provider: string;
  readonly kind: string;
  readonly label: string;
  readonly target: SubjectId | null;
  readonly evidence: readonly RelationEvidence[];
}
interface SourceGroup {
  // v1の他フィールドは不変
  readonly relations: readonly SourceRelation[];
  readonly hints: readonly Hint[];
  readonly setup: readonly SetupItem[];
  readonly presentation: GroupPresentation;
}
interface GroupPresentation {
  readonly columnId: ColumnId;
  readonly role: 'regular' | 'config' | 'composition';
}
interface SourceDeclaration {
  // v1の他フィールドは不変。presentationは中身が無くなるため持たない。entriesは持たない
  readonly kind: TsDeclarationKind;
  readonly meanings: readonly Meaning[];
  readonly relations: readonly SourceRelation[];
  readonly hints: readonly Hint[];
  readonly setup: readonly SetupItem[];
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

`SetupItem.target` は相手が地図に載っているときだけそのID、載っていなければ `null`（`label` だけで見せる）。`label` はpluginがコードの式から作る（例 `inject(AuthService)`、`@UseMiddleware(RateLimitMiddleware)`）。

#### v1の各フィールドを埋める箱

1節の「JSONの書き手」を、フィールド単位にしたもの。

| v1のフィールド | 書き手 | 内容 |
| --- | --- | --- |
| `schemaVersion` / `provenance` | 組立 | 固定値。抽出の出力は必ず `extracted` |
| `snapshotId` | 組立 | 正規化JSONのSHA-256（[付録J](#j-生成とpublish)） |
| `project` | config | `project.id` / `name` |
| group `id` `name` `kind` `filePath` `members` | コア | 宣言の列挙と包含（[付録B](#b-コアts索引)） |
| group `expansion` | コア（configの範囲で） | アプリのコード（include）の宣言は `included`。ホワイトリストのライブラリの宣言は `boundary` で、アプリが直接参照したメンバーだけを持つ（[4.2](#42-ライブラリは接点だけから)） |
| group `relations` | コア | class自身の `extends` / `implements`。`boundary` の箱は線を持たない |
| 宣言 `id` `name` `enclosingDeclarationId` `kind` | コア | `kind` はTSの種類だけ |
| 線（`origin: 'ts'`） | コア | `call` `read` `type` `construct` `extends` `implements` `override` `contract`（呼んだ先がinterfaceのmember）。`returns` は出さない |
| `meanings`（線・宣言） | plugin | [下の表](#付与の全表) |
| 付与された線（`origin: 'plugin'`） | plugin | [下の表](#付与の全表) |
| `setup`（group・宣言） | plugin | [下の表](#付与の全表) |
| relation `evidence` | コア／plugin | `location` は根拠の所在、`expression` はその範囲の原文 |
| `source.location` / `signature` | コア | 宣言の所在と契約 |
| 宣言の `source.excerpt` | コア（configの範囲で） | `sourceText` に合うファイルだけ `code`、他は `declaration-only` |
| groupの `source.excerpt` | 組立 | 常に `declaration-only`。groupは宣言ヘッダーとして扱い、本文は各メンバーで見る |
| `unresolved` | コア | 解けなかった参照（理由はv1の5種） |
| 宣言 `unitTests` | 組立（Vitest・Zeltの材料から） | case一覧はrunner、testのsetupはZelt、対応付けは組立（[付録F](#f-unit)）。ライブラリの宣言は常に未収録（`uncollected`） |
| 宣言 `e2eTests` | 組立（Zelt・Vitest・http-requestsの材料から） | routeを登録したmethodだけに付く（[付録G](#g-e2e)） |
| `hints`（group・宣言） | plugin | [下の表](#注記の付与規則全表) |
| `presentation.columnId` / `role`、`MapPresentation` | config | globのrulesとcolumns（[付録H](#h-config)） |

#### 付与の全表

← ②1・②2（付与が示すもの）、②4（確かめた事実だけ）。

| provider | 付与の種類 | 付与先 | kind | 今のfixtureでの形 |
| --- | --- | --- | --- | --- |
| valibot | 意味 | valibotのschemaを作る変数の宣言と、それを読む線 | `schema` | 宣言kind `schema`、線kind `schema` |
| drizzle | 意味 | table builderで作る変数の宣言と、それを読む線 | `table` | 宣言kind `table`、線kind `table` |
| zelt | 意味 | `EventBusSchema` 拡張のmember | `event-type` | 宣言kind `event-type` |
| zelt | 意味 | eventbusの `on()`・`once()` に渡した関数への「読む」 | `register` | 線kind `register` |
| zelt | 線 | routeのcontroller method → middlewareの実行method | `middleware` | 線kind `middleware` |
| zelt | 線 | emitの所有者 → 購読callback | `event` | 線kind `event` |
| zelt | 線 | app factory → 登録したclass（controller・middleware・handler・adaptor・config） | `register` | 線kind `register`（`createEcApp` から9本） |
| zelt | setup | constructor（`inject(X)` の既定値）、class・method（`@UseMiddleware`・middlewareを付けるdecorator）、Configのclass（差し替えるlibraryのConfig） | `inject`・`middleware`・`config-override` | 無い（原文と注記 `DI / 初期化` でだけ見える） |

同じ2点にコアの線があるなら、pluginは新しい線ではなく意味を付与する（線を2本にしない）。付与の種類とkindの名前は案で、細部は[付録N](#n-実装時に決めること)。

#### 注記の付与規則（全表）

← ②1・②2（注記が示すもの）、②4（確かめた事実だけ）。並び順の規則は出力の再現性のため（②4）。

hintsは、pluginが**自分で見つけた事実**からだけ付ける。人の説明文だったv1のhint（例「userId → Order」「header / cookie」）と「設定値は非表示」系は、fixtureの移行で既に消した（了承済み）。移行後のfixtureの `hints` は、下表のpluginが付けるはずのlabelだけ（移行時53件。ライブラリの箱で消えたconstructorの5件を除いて今は48件）。

| plugin | 付与先 | label | 手書きfixtureでの例 |
| --- | --- | --- | --- |
| zelt | HTTP routeのcontroller method | `<METHOD> <fullPath>` | `POST /api/auth/register` |
| zelt | event購読のcallback | `EVENT <eventName>` | `EVENT order:created` |
| zelt | Injectableのmetadataを持つclass（`@Injectable`・`@Controller`・`@Middleware` はいずれも内部で `injectable()` を付ける）とConfigのconstructor | `DI / 初期化` | `AuthController.constructor` |
| zelt | core組込みのglobal middlewareの `use` | `全HTTP · core自動登録` | CorsMiddleware / SecureHeadersMiddleware |
| drizzle | table宣言 | table名（table builderの第1引数） | `order_items` |
| drizzle | `$inferSelect` / `$inferInsert` から作ったtype | `DB schema由来` | `User`、`NewOrder` |
| valibot | `InferOutput` から作ったtype | `InferOutput<Schema名>` | `InferOutput<RegisterSchema>` |

- 同じ宣言に複数pluginが付けたら配列に並べる。並びはprovider ID順、同provider内は根拠の位置順。同じprovider・labelは1件にまとめる。
- lifecycle（起動・終了時の呼出）の登録には注記を付けない。旧fixtureの `lifecycle · 購読を登録` は人の説明を含むので、移行で外した。
- 移行後のfixtureのgroupの `hints` は全件空配列。group向けの付与規則は今は無く、型としてgroupにも置けるだけ。
- middleware / eventのリレーションチップ（UIの[relations.lib.ts](src/relations.lib.ts)の `attachments`）はhintsに入れない（②に根拠が無い。[5.6](#56-根拠がpolicyに無い項目)）。付与された線がSSOTであり、チップにするのはUIが線の種類（`middleware`・`event`）から導出する表示判断のまま。UIの「tag」（`RelationTag`）とJSONの `hints` は別物として名前を分ける。
- setupができても `DI / 初期化` の注記を残すかは[付録N](#n-実装時に決めること)。

#### pluginが無いときの値（全表）

pluginは付与だけなので、pluginが無ければその付与が無くなるだけで、コアの事実と型は変わらない。

| 値 | 付けるplugin | pluginが無いとき |
| --- | --- | --- |
| `meanings` | valibot / drizzle / zelt | 空配列。UIはTSの種類を出す（schema・tableの宣言は `value`、線は `read`。`register` の線は `read`。event-typeは `signature`） |
| 付与された線 | zelt | 無い |
| `setup` | zelt | 空配列 |
| `e2eTests` | zelt＋vitest＋http-requests | 全宣言で `null`（routeが分からず結ぶ先が無い） |
| `unitTests` | vitest＋zelt | casesは空、coverageは `uncollected` |
| `hints` | 各plugin | 空配列 |

#### 抽出で埋まらない値

v1にあるが実コードから抽出できない値5つの扱い。

| v1の値 | 扱い | 理由 |
| --- | --- | --- |
| `presentation.expandedY` | 削除。UIが計算 | 手で調整した座標で、実コードに根拠が無い。並び順はソース位置（パスと開始行）から決められる |
| `presentation.hint`（人の説明文） | `hints` に置換。人の説明文は消える | 抽出できるのはpluginが見つけた事実だけ |
| `excerpt.kind: 'redacted'` | 削除。`sourceText` から外して `declaration-only` | 秘密値を自動検出できるとはしない。伏せたい範囲は人がconfigで決める |
| `presentation.origin` | 削除 | 抽出物は常に `provenance` で表せる。UI未使用 |
| `demoScenarios` | 削除 | 仮変更はdiffで表す。snapshotの一部ではない |

### B. コア（TS索引）

実装する②: ②1（流れの線: 呼ぶ・読む・型・contract）、②4（構造はTSの事実から。解けない参照は `unresolved`）、②2（ライブラリの箱は接点だけ）。IDの形式は②に根拠が無い（[5.6](#56-根拠がpolicyに無い項目)）。

コアは、どのTSプロジェクトにも効く部分。宣言・参照・値の由来を1つのProgramから取り（TS索引）、全pluginが読む。出すのはTSの事実だけで、線と宣言の種類にライブラリの意味を入れない（[4.5](#45-v1からの変更)）。

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

索引自体はTSの基本graphを持つ。アプリのtestファイルも索引には入るが、通常の地図へは出さない。test setupが参照するtest専用classなどは必要な宣言だけboundaryとして組立時に出す。ライブラリ自身のtestは索引に入れない。存在するIDへの参照を、所在のない名前へ落とさない。

pluginは索引・ASTを変更しない。未知IDはundefined、解けないsymbolはnull。別Programのnodeをspanへ渡すのは契約違反。`node(span)` は範囲完全一致の最深node、`directCalls` は入れ子関数へ降りず、引数内のcallは含む。

property/トップレベル変数のinitializerはその宣言が参照を所有する。それ以外のトップレベル実行文はfile groupが所有する。関数内では最内の関数が所有し、ローカル変数のためだけにnodeを増やさない。

#### 箱の切り方とID

| ソースの形 | group / 宣言 |
| --- | --- |
| class / interface | 宣言ごとのgroup。method・constructor・getter・property・signatureがmember |
| トップレベル関数 / 変数 / type | 同じモジュールのfile groupにmember。変数に直接束縛されたarrow/functionは `function` 一つで、`value` と二重化しない |
| 関数引数のcallback / 入れ子関数 | 独立した宣言（`callback`）。`enclosingDeclarationId` に最内の関数を設定。内部の依存はその宣言が所有 |
| constructorのparameter property | 宣言にしない（注入された値かどうかに関わらず。[4.1](#41-責務と流れから)）。通常の引数・ローカル変数も値追跡のbindingであり宣言にしない |
| get / static・instance | 別の宣言。readはgetter。class自身へのextends/implementsはgroupが所有 |
| namespace / 入れ子class | 実際の宣言を収録し、修飾名をIDへ含める。実装都合の新しい業務groupは作らない |

折りたたみは表示上の集約。methodの関係をclassにも二重保存しない。interfaceは実在するものを収録するが、interfaceの無いコードへPortは足さない。

IDは `prefix + JSON.stringify(parts)`。groupは `["class|file|interface", path, qualifiedName]`、宣言は `[groupId, enclosingId, kind, staticOrInstance, name]`。無名callbackのnameは親内の構文順序による `@callback:0` 等で、表示でも生成名と分かるようにする。同名無名宣言は構文順のordinalを追加する。

callは `["call", path, start, end]`。relationは `[owner, to, kind]`。route（内部）は `[provider, registrationKey, subject]`。testは `[provider, registrationCallId, caseKey]`。すべて同じrevision内で照合する。名前付き宣言は前方への行追加でIDが変わらない。rename・匿名callbackの挿入順変更には永続性を保証しない。

fixtureの短いIDからこの形へ変わることの扱いは[4.6](#46-policyに根拠が無い結果)。

#### 線の取得規則

| 線 | 機械的な取得方法と限界 |
| --- | --- |
| call / construct | getResolvedSignatureの宣言、alias解決後のSymbolへ。unionなどで実装候補が複数なら未解決。runtimeのoverride dispatchまでは保証しない |
| contract | call先の宣言がinterfaceのmemberなら、コアがその線を `call` ではなく `contract` として出す（TSの事実）。対象は地図に載っているinterfaceだけ（[4.1](#41-責務と流れから)・[4.2](#42-ライブラリは接点だけから)） |
| read | property・getter・変数のSymbolと、値として参照された関数・method。callee自身をreadとして二重化しないが、中間receiverのpropertyは読む。呼んだ先が地図に無い宣言に解決されるとき（`promisify` の戻り値を持つ `scryptAsync(…)` など）はcallを引かず、地図にあるcallee（変数）へのreadを残す。代入の左辺（write）は読みとして数えない（[付録N](#n-実装時に決めること)）。ただし相手がparameter propertyなら、宣言にしないので線を引かない（`unresolved` にも入れない） |
| classを値として渡す式 | `inject(X)`・`@UseMiddleware(X)`・`controllers: [X]` のように、classを値として参照する式は線にしない（`unresolved` にも入れない）。その意味はplugin:zeltがsetupか付与された線として出す（[4.1](#41-責務と流れから)。根拠は[5.6](#56-根拠がpolicyに無い項目)） |
| decoratorの式 | decoratorの呼出と引数からは線を引かない（`unresolved` にも入れない）。TSの構文で決まり、フレームワークを知らなくてよい。内容はplugin:zeltがsetupとして付与する（[5.5](#55-setupと流れの境目)） |
| type | 型構文のSymbolを辿り、明示の戻り型を含めてtypeにする。関数を返す場合も、戻り値に関する線は型だけで、返した関数への `returns` は引かない（[4.1](#41-責務と流れから)。`EcJwtConfig.resolveUser` の戻り型の `JwtPayload`・`ResolveUserResult` は[ec-backend.extract.json](ec-backend.extract.json)の提案では地図に載らないので線は出ず、返した関数はcallbackの宣言として包含で表れる）。型文字列を再parseしない。推論された複合型の内部依存までは収集しない |
| extends / implements / override | heritage句と基底memberのSymbolから。基底classの場所を「Port」へ移動しない |
| callbackへの関係 | 関数を値として渡すときは、無名callbackでも名前付きのmethod・関数でもreadを張る（[4.1](#41-責務と流れから)。plugin:zeltが `register` の意味を付与しうる）。返すときは線を引かない（包含で表す）。callは実行を静的に確認できた場合のみ。callback内の線を外側にも転記しない |
| 動的property / 関数を保持した変数 | 定数property名・不変aliasまでは解決。可変bindingや複数候補は `unresolved` |
| ライブラリ | 相手がホワイトリストのライブラリなら、その宣言をboundaryの箱のメンバーにする。箱にはアプリが直接参照したメンバーだけを入れ、箱の中から出る線は取らない。ホワイトリスト外・Node標準・TS標準の相手は線にも `unresolved` にもしない（[4.2](#42-ライブラリは接点だけから)） |

`unresolved.reason` への対応: 動的property → `dynamic-access`、ホワイトリストのライブラリだと分かったが宣言を解決できない参照 → `external-boundary`、関数を保持した変数 → `stored-function-reference`、引数で受けたcallbackの呼出 → `parameter-callback`、その他のapp内の未解決 → `symbol-unresolved`。解けない相手には偽の宣言を作らない。

relationの同一性は所有者・to・kind。evidenceの異なるcallは同じ線の使用箇所として `evidence` に並べる（使用箇所をすべて並べ、最初の1か所だけにしない）。v1の根拠は行と式だけなので、同じ行・同じ式の使用箇所は1件にまとめる。

実際の[OrderService.findById](../../integration/ec-backend/src/usecase/order.service.ts)では、`this.drizzle.db` からDrizzleService.dbへのreadが残る。`select()` がライブラリのAPIでもこの線を省かない。`orders` を読む線には、drizzle pluginが `table` の意味を付与する。OrderRepositoryの箱は作らない。

#### sourceの規約

| 項目 | 契約 |
| --- | --- |
| signature | 修飾子・generic・optional・default・型aliasを維持。関数本体は除く。変数の型が省略されたときだけcheckerの型表示を補う |
| 原文 | `sourceText` に合うファイルだけ `code`。未許可は `declaration-only`。signature内の初期化値も未許可時は除く。秘密値を自動検出できるとはしない |
| 境界 | ホワイトリストのライブラリの宣言を同じProgramで解決できればboundaryの箱を作る。型定義も所在として有効。groupの原文は常に `declaration-only`（groupは宣言ヘッダーとして扱い、本文は各メンバーで見る） |

### C. plugin共通

実装する②: ②4（pluginは確かめた意味だけを付与する。事実を書き換えない。取れない範囲はpartial、契約違反は生成失敗）。処理の形とplugin間の独立は1節と前提2。

pluginは、コアの結果を読んで**材料**を返すだけの箱。JSONには触らない。どの材料がv1のどこへ出るかをここで固定する。

~~~mermaid
flowchart LR
  I["コアの結果<br/>SourceIndex"] --> Z["Zelt"]
  I --> T["Runner"]
  I --> L["Library"]
  Z --> F["材料<br/>PluginResult"]
  T --> F
  L --> F
  F --> A["組立"]
~~~

plugin間の呼出はしない。VitestはZeltのtargetを知らず、ZeltはitやbeforeEachを知らない。Jest/Mocha追加時もrunnerの箱だけ差し替える。初期実装はVitestと下記ライブラリpluginを同梱し、外部pluginの動的インストール・公開SDK化は対象外。

内部型:

~~~ts
type DiClass = 'service' | 'config';
type Feature = 'meanings' | 'relations' | 'hints' | 'setup' | 'routes' | 'di'
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
// subjectは宣言・groupのID、またはコアの線のID
type Material =
  | { kind: 'meaning'; subject: Id; meaning: string; evidence: Evidence[] }
  | { kind: 'relation'; from: Id; to: Id; relation: string;
      applicationId: Id | null; evidence: Evidence[] }
  | { kind: 'hint'; subject: Id; label: string; evidence: Evidence[] }
  | { kind: 'setup'; subject: Id; setup: string; label: string;
      target: Id | null; evidence: Evidence[] }
  | { kind: 'route'; subject: Id; registrationKey: string; applicationId: Id;
      method: string; path: string; evidence: Evidence[] }
  | { kind: 'di'; subject: Id; value: DiClass; evidence: Evidence[] }
  | { kind: 'test'; value: TestContribution }
  | { kind: 'test-setup'; value: TestSetupContribution }
  | { kind: 'application'; value: ApplicationContribution }
  | { kind: 'request'; value: RequestContribution };
interface PluginInput {
  source: SourceIndex;
  scopes: readonly AnalysisScope[];
}
interface PluginResult {
  revision: string;
  materials: Material[];
  reports: AnalysisReport[];
}
interface ExtractionPlugin {
  id: ProviderId;
  features: readonly Feature[];
  analyze(input: PluginInput): Promise<PluginResult>;
}
~~~

| 材料 | 付与の種類（1節） | v1への出力 |
| --- | --- | --- |
| meaning | 意味 | 対象の宣言・コアの線の `meanings` に `{ provider, kind }` を足す。種類は変えない |
| relation | 線 | 所有者の `relations` に付与された線（`origin: 'plugin'`）として足す。同じ2点・同じ向きにコアの線があれば契約違反（意味の付与にする） |
| hint | 注記 | 対象の `hints` に `{ provider: plugin.id, label }` |
| setup | setup | 対象の `setup` に `{ provider, kind, label, target }` |
| route / di / test / test-setup / application / request | testの対応の材料 | 配信しない。組立が突き合わせて `unitTests` / `e2eTests` を作る。routeのmethod・pathの注記は別のhintとして出す |

`AnalysisReport` は内部の取得状況。v1には `AssociationCoverage { status, searchScope, inspectedFiles }` としてだけ出る（`status` は `disabled` を `uncollected` に写す、`searchScope` は `scope.files`）。それ以外の報告は抽出結果として返し、配信しない。

complete-in-scopeは、**configで選んだ範囲内**を列挙できたという意味。未対応syntax・不明なtarget・動的なtest登録があればpartial。casesが空でもuncollectedなら「testなし」ではない。

`scope.files` はglob展開後の正準path一覧、`inspectedFiles` は実際に読んだ一覧。report IDはprovider・feature・category・scope.filesから作る。コアはsource、runnerは指定test scope、Zeltはsourceと指定Unit scopeを担当し、各担当feature/scopeについて必ずreportを返す。設定されていない組合せはhostがdisabledとして記録する。

hostがplugin.idとreport/evidenceのproviderの一致を検証する。索引にないID、別revision、宣言していないfeature、report欠落、scope外の読み取り、コアの事実を上書きする材料は契約違反。例外・不正ID・metadata worker失敗はpartialではなく生成失敗。失敗した新JSONは配信しない。

### D. Zelt

実装する②: ②1（route・middleware・event・appへの登録はフレームワークの配線、DI・decoratorはsetup）、②4（runtimeのmetadataという事実から付与する。名前一致で結ばない）。workerの安全の制約は②に根拠が無い（[5.6](#56-根拠がpolicyに無い項目)）。

plugin:zeltは、runtimeのmetadata（route・middleware・DI・event・lifecycle）をコアの宣言IDへ結び、意味・付与された線・注記・setupと、testの対応の材料（routeとDIの分類）を出す。コアの事実は書き換えない。contractはコアが引くので、plugin:zeltは扱わない（[4.1](#41-責務と流れから)）。classを値として渡す式とdecoratorの式はコアが線にしないので、その内容（DI・middleware・Configの差し替え）はここでsetupか付与された線として出す。

~~~mermaid
flowchart LR
  W["隔離worker<br/>指定app・照合対象module<br/>metadata・登録を読む"] --> R["RuntimeReference<br/>module export / 宣言位置<br/>ctor名一致は使わない"]
  R --> B["TSとの照合<br/>同じsource mapping<br/>Symbol → 共通ID"]
  B --> F["Zeltの材料"]
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
| HTTP route | controller methodに hint `<METHOD> <fullPath>`。E2E照合用に、app・method・pathを持つrouteの材料を返す（配信しない） |
| middleware | routingが使う登録・skip判定の共通処理をinspectionでも使用。組込みCors/SecureHeaders、親子mount、class/method decoratorを含める。middlewareの実行条件ではなく登録の適用関係を示す |
| middlewareの線 | routeのcontroller method → middleware実行methodへ、付与された線 `middleware`。実行methodを登録の型・Symbolから特定できなければpartial。組込みのglobal middlewareには hint `全HTTP · core自動登録` |
| DI/config | metadataのInjectable/Configの分類（材料 `di`、配信しない）＋Symbolで識別したinject呼出。constructor default/property initializerを読む。constructor省略時は基底を辿る。動的provider・解けないsuper引数はpartial。Injectableのmetadataを持つclass（`@Injectable`・`@Controller`・`@Middleware` はいずれも内部で `injectable()` を付ける）とConfigのconstructorに hint `DI / 初期化` |
| setup | inject呼出 → constructorに `inject`（targetは注入するclass）。`@UseMiddleware` とmiddlewareを付けるdecorator（`@RateLimit` 等） → そのclass・methodに `middleware`（targetはmiddleware class）。Configのclassが差し替えるlibraryのConfig → そのclassに `config-override`。labelはコードの式から作る。地図の線にはしない（[4.1](#41-責務と流れから)） |
| register | eventbusの `on()`・`once()` に渡した購読callbackへのコアの `read` に、意味 `register` を付与する（線は1本のまま。[4.1](#41-責務と流れから)）。app factoryの登録式 → 登録されたclass（controller・middleware・handler・adaptor・config）はコアの線が無いので、付与された線 `register` として足す |
| event | eventbus blueprintにもgetInspectionを追加しadaptor/handlersのidentityを公開。emit/onのSymbolと注入先busを照合。同じapp＋一意に解決した登録provider＋静的event名でのみ、emitの所有者 → 購読callbackへ付与された線 `event`。購読callbackに hint `EVENT <eventName>`。`EventBusSchema` 拡張のmemberに意味 `event-type` を付与する（型引数・宣言の解決による。event文字列と同名のtypeを探して結ばない） |
| lifecycle | 入口としては出さない（`entries` を廃止したため）。注記も付けない（[付録A](#注記の付与規則全表)）。`LifecycleManager.register` へのcallは、コアの通常のcallとして出る |

event購読のbusはadaptorのgroup ID（内部の照合用）。同じappで同じproviderに複数のbus登録があり、注入先を一意に決められなければpartialにする。busを表す架空の宣言は作らない。

getInspectionは**新設するAPI**であって現在存在するという意味ではない。core内ではctorを保持する型、worker出口ではRuntimeInspectionというJSON型にする。登録位置はfeature生成時のtraceとdecorator位置から取得し、TS宣言位置へ正規化する。組込み登録はその定義位置を根拠にする。

workerはOSのsandboxではなく、moduleのトップレベル副作用は起こりうる。Zelt無効時はworkerもapp importも行わない。IPCに結果、stdout/stderrにログを分離し、timeout・import失敗・壊れた応答は生成失敗。DBやネットワークへ接続しないapp factoryを入力条件とする。

### E. Library

実装する②: ②2（ライブラリの活用を、線と宣言に付与する意味で見せる）、②4（定義元のSymbolという事実で判定し、名前の見た目では判定しない）。

Library pluginは、ライブラリのexportへSymbolを解決できたときだけ意味とhintを付与する。コアの種類は変えない。

| plugin | 判定と出力 |
| --- | --- |
| valibot | initializerのcalleeをimport alias越しにvalibot exportへ解決し、戻り型が同packageのBaseSchema/BaseSchemaAsyncへ由来する場合に、その宣言とそれを読む線へ意味 `schema`。suffixでは判定しない。`InferOutput<typeof X>` のtypeに hint `InferOutput<X>` |
| drizzle | drizzle-ormのtable builder Symbolと戻り型のTable由来を確認して、その宣言へ意味 `table` とhint（table名）。tableを読むコアの `read` にも意味 `table` を付与する。`$inferSelect` / `$inferInsert` のtypeに hint `DB schema由来` |
| http-requests | 解決済みclient call、またはconfigのhelper契約からapp/method/pathを読む。E2Eへの対応は[付録G](#g-e2e)の組立が行う |

ライブラリversionでSymbolの定義元が変わり判別不能ならpartial。外見が似た呼出を成功扱いしない。

### F. Unit

実装する②: ②1（検証。case本文が直接呼んだ宣言にだけ付ける）、②4（testのsetupは値の由来という事実で結ぶ。未取得を空にしない）。

Unitの一覧は「case本文が直接呼んだ宣言」に付ける。testのsetup（mock一覧・Solitary/Sociable。v1の `UnitSetup`。1節のsetupとは別物）は、呼出のreceiverの由来をZeltのfactoryまで辿って別に結ぶ。

~~~mermaid
flowchart LR
  R["Runnerの材料<br/>登録・本文・適用hook"] --> U["Unit対応<br/>case本文の直接call<br/>→ 呼出先宣言"]
  Z["Zeltの材料<br/>factory call + target経路<br/>→ DI / override"] --> S["setup照合<br/>receiverの由来が<br/>factory + 経路と一致"]
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
interface TestSetupContribution {
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
| TestSetupContribution | `UnitSetup { id, targetClass, location }`。`targetClass` と各Idは `ClassReference { filePath, name }` に写す。`location` はfactory callの所在 |
| `analysis.kind = 'zelt'` | `resolution: 'resolved'` と `dependencies` / `configs` / `overrides` |
| `analysis.kind = 'unresolved'` | `resolution: 'unresolved'` と同じ `reason` |
| `analysis.kind = 'uncollected'` | `resolution: 'unresolved', reason: 'not-collected'` |

| 箱 | 初版で扱う構文・規則 |
| --- | --- |
| Vitest登録 | import元・aliasを解決したdescribe/it/test/hook。globalsはconfigで明示した場合のみ。suiteの入れ子・concurrentを保持 |
| parameterized case | 静的な配列literalのeachはcaseKeyをindexにして展開。動的なtableはtemplate一件・partial。引数に依存するsetup値の代入は初版では未解決 |
| hook文脈 | configのserial/stackならbeforeEachを外suite→内suite、同suiteは登録順。concurrent・parallel・未知modifierは文脈未解決。Unitのsetupでは、beforeAll由来の共有値は初版の由来追跡対象外（E2Eのappの追跡だけは初版で扱う。[付録G](#g-e2e)） |
| Unit対象 | case本文のdirectCallsで、収録したapp宣言への直接呼出を一覧化。同じcaseの同じtargetは一行、callsへ集約。helperの先・hook内・未実行callbackはテスト対象に伝播させない |
| receiver由来 | binding Symbolを使い、await/括弧/type assertion、変数代入、不変alias、静的property経路を追う。caseごとに外部bindingをunknownへ戻し、beforeEachから開始 |
| 未対応の由来 | 分岐・loop・動的property・分割代入・helperを経た代入は未解決。alias書換え、closure共有、非await非同期処理、opaque関数へのescapeが関係すればshared-state |
| setup照合 | factoryCall＋resultPathが一致し、呼出先の所属classとも矛盾しなければ付与。型が同じだけの別instanceへは付けない |
| Zelt factory | import SymbolでcreateTestTargetを特定。第一引数のclass、optionsのconfigs/overrides、返却値のtarget経路を読む。testを実行しない |
| Zelt詳細 | targetの直接DI、明示configs、setupFilesのconfigureTestDefaultsを読む。定数array/object/alias/spreadまで。動的値・解けない継承・global defaultsの読取漏れがあればunresolved |

setup機能が無効ならnot-collected。factoryに対応できてもDI等が不明ならunresolved。**未取得のdependenciesを空にしてSolitaryとは判定しない。**

Solitary/Sociableと mock一覧はUIがsetupから算出する（v1のまま）。抽出側は、config差替えとjose等の通常importをoverridesに入れない。overridesはserviceの差替え対象classだけで、useValueの中身は配信しない。

収録するのはアプリのコードのtestだけで、ライブラリ自身のtestは対象外（[4.2](#42-ライブラリは接点だけから)）。ec-backendには実際のUnit testを12ファイル・約212 case追加済み（未コミット。usecase・モジュール関数・middleware等）。手書きfixtureのUnit一覧はまだ0件で、反映は別作業（[付録L](#l-uiの追従)）。

照合の形の例として、auth-jwtパッケージ自身をアプリとして抽出する場合の[JwtServiceのtest](../../packages/auth-jwt/src/jwt.service.test.ts)は、beforeEachのcreateTestTarget → testTarget.target → jwtService → case内のsignという由来を照合する。JwtConfig→TestJwtConfigはconfig差替えであってmockではない。CreateProductSchemaが内部から呼ばれるだけなら、そのschemaへUnit対象を伝播しない。

### G. E2E

実装する②: ②1（検証。送ったrequestのrouteを登録したmethodにだけ付ける）、②4（app・method・pathの事実で照合し、名前やURLの見た目で結ばない。範囲が一部なら「一部のみ」）。

E2Eは、testが送ったrequestとplugin:zeltのroute登録が同じapp・method・pathで一致したとき、そのrouteを登録したcontroller methodの `e2eTests` に付ける（既存決定のルート文字列照合と同じ）。Unit一覧とは混ぜない。

~~~mermaid
flowchart LR
  C["RunnerのE2E case<br/>本文のcall"] --> M["request照合<br/>同じapp + method + path"]
  Q["Request / Applicationの材料<br/>app式 + factoryの戻り値<br/>method / path"] --> M
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

初版はapp.http.requestと、configで宣言したhelperと、exportされない局所helperを扱う。ec-backendでは[authRequest](../../integration/ec-backend/e2e/helpers/test-setup.ts)のapp引数0・method引数2・path引数3を指定できる。registerUser/loginUserは固定のPOST/pathを指定できる。これはconfig由来の契約（basis `configured`）として、自動推論した事実と区別する。

初版で広げる3つの経路（9/23のユーザー判断。ec-backendの `product.spec.ts` で必要になる）:

| 経路 | 規則 | ec-backendの例 |
| --- | --- | --- |
| `beforeAll` で作ったapp | suiteの `beforeAll` でapp factoryの戻り値を代入した変数を、同じsuite内（入れ子を含む）のcaseから追う。そのsuite内で代入が1か所だけのときに限る | `testApp = await createTestApp()`、入れ子suiteの `paginationApp` |
| テンプレート文字列のURL | 置換部分が1つのsegment全体を占めるとき、そのsegmentを同じ位置の必須 `:parameter` にだけ照合する。固定segmentには照合しない | `` `/api/products/${created.id}` `` → `/api/products/:id` |
| exportされない局所helper | 同じファイル内で定数に束縛された関数で、本体がdirect requestか宣言済みhelperを1回だけ呼ぶものは、その呼出を展開してhelper経由（`via: 'helper'`）のrequestとする。分岐や複数のrequestがあればpartial | `createProduct` → `authRequest(testApp, adminToken, 'POST', '/api/products', data)` |

method/pathはliteral・不変の定数alias・静的に連結できる文字列と、上のテンプレート文字列まで。direct requestは文字列URLとobject literalのinitを対象にし、method省略はGET、Request objectや可変initは未対応。URLのquery/hashを除き、pathを同一appのrouteへ照合する。初版のroute文法は固定segmentと必須の:parameter。複数候補、wildcard/regex、動的URLはpartialとして未対応にする。曖昧な場合に先頭のrouteへ付けない。

共有hook・helper内部の全requestを再帰実行した扱いにはしない。初版では `includesSharedSetup = false`。suite内に関連する未対応のrequest経路がある場合はE2E coverageをpartialにする。configのE2E範囲がe2e testの一部（サンプリング）なら、どのrouteのcoverageも `partial` にし、一致するrequestが無いrouteは「一部のみ・0件」とする（`uncollected` にしない。[4.4](#44-コードと一致するから)）。

### H. config

実装する②: ②3（列とroleは人の意図。線は書けない）、②2（載せるライブラリの選択）、②1（「このプロジェクト」の範囲）。原文の範囲は②に根拠が無い（[5.6](#56-根拠がpolicyに無い項目)）。列内の並び順をconfigで決めないことは確定（[4.6](#46-policyに根拠が無い結果)）。

configは、何を収録するか（地図に載せるライブラリを含む）・原文をどこまで出すか・どのpluginを使うか・どの列に置くかを人が決める場所。

~~~mermaid
flowchart LR
  F["実ソースのfilePath"] --> R["順序付きglob rules<br/>最初に合うルール"]
  R --> P["GroupPresentation<br/>columnId / role"]
  P --> U["UIのlayout<br/>列内の並び順（パスとソース位置から）<br/>+ 表示中の高さ"]
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
// 5.5(b)の提案の形。exportsに無いexport（関数・decorator・型）は地図に載せない
interface MapPackage {
  package: string;
  exports: string[];
}
interface ExtractConfig {
  version: 1;
  project: { id: string; name: string };
  root: string;
  tsconfig: string;
  include: string[];
  exclude: string[];
  mapPackages: MapPackage[];
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

`mapPackages` と `sourceModules` は役割が違う。

- `mapPackages`（ホワイトリスト）は**地図に載せるか**を決める。package名と、そのpackageのentry（`sourceModules` で解決した先）から地図に載せるexport名を指定する（[5.5](#55-setupと流れの境目)(b)の提案。決定はpackage単位までで、exportまで指定するかは未決。どれを気にするかは本人が選ぶ、という根拠は[4.2](#42-ライブラリは接点だけから)）。載るのは列挙したclass・interfaceと、アプリが直接参照したそのメンバーだけ（[4.2](#42-ライブラリは接点だけから)）。存在しないexport名はエラー。Node標準・TS標準は指定できない。
- `sourceModules` は**どこからソースを読むか**（TSの解決とZeltのworkerの解決）を決める。ここにあっても `mapPackages` に無ければ地図には載らない（例の `@zeltjs/testing`・`@zeltjs/decorator-metadata` は解決のためだけにある）。
- `mapPackages` にあって `sourceModules` に無いpackageは、通常の解決（`node_modules` の型定義）の所在で箱になる。
- 載せたpackageのファイルをどの列に置くかは、他のファイルと同じ列ルール（globはsourceModulesで解決した先のpath）で決める。

設定にないpluginはdisabled。ZeltのsetupDetails=falseはtest-setupsをuncollectedとし、factory/targetの対応だけは返してよい。Vitestの実行設定は自動でserialにせず、利用中のrunner設定を明示する。setupFilesはrunner側の設定と一致させ、未指定のglobal defaultを不存在扱いしない。

ec-backendの設定は[ec-backend.extract.json](ec-backend.extract.json)（上のExtractConfigに適合する）。設定例はこのファイルだけに置き、ここには要点だけを書く。手書きfixtureは「このconfig＋この文書の規則」から説明できる状態を目標にしている（照合の結果は[付録P](#p-確認状況)）。

| 項目 | ec-backendでの値 | 理由 |
| --- | --- | --- |
| `root` | `../..`（configファイルの置き場所 `mocks/studio-spatial/` から見たrepository root） | srcと参照先のpackage sourceを同じProgramで解決する |
| `include` / `exclude` | `integration/ec-backend/src/**/*.ts`、`**/*.test.ts` を除く | アプリのコードだけを「全メンバーを載せる宣言」にする。testは索引には入るが地図に出さない |
| `mapPackages` | `@zeltjs/core`（`LoggerService`・`LifecycleManager`・`CorsMiddleware`・`SecureHeadersMiddleware`・`CorsConfig`）、`@zeltjs/auth-jwt`（`JwtMiddleware`・`JwtService`・`JwtConfig`）、`@zeltjs/kv`（`KVStore`・`MemoryKVAdaptor`）、`@zeltjs/eventbus`（`MemoryEventBusAdaptor`）、`@zeltjs/rate-limit`（`RateLimitMiddleware`） | 5.5(b)の提案の形。関数・decorator・型（`inject`・`request`・`Controller`・`Lifecycle`・`JwtPayload` 等）は載せない |
| `sourceText` | app.ts・domain・entry・infra・usecaseと、載せた5 packageの `src/**` | `src/config/` は外して `declaration-only`（v1の `redacted` の代わり）。ライブラリの箱も原文を見せるのでpackageのsourceを入れる。外部公開時は空にする |
| `presentation.columns` | `column:0` Entry / Middleware、`column:1` Use case、`column:2` Domain、`column:4` Adapter / Infrastructure、`column:5` Config、`column:6` 外部、`column:other` 未分類（すべて幅310） | 列のIDとlabelは手書きfixtureのもの。`column:3` は旧 `Port / interface` 列の跡で欠番。`column:6` のlabel「外部」は外界（DB・ネットワーク）と混同を招くので、「ライブラリ」への変更を提案する（configファイルは今回変更しない。[4.2](#42-ライブラリは接点だけから)） |
| `presentation.rules` | app.ts → Entry（composition）、`packages/**/*.config.ts` → ライブラリ（config）、`packages/**` → ライブラリ、`src/config/**` → Config（config）、`src/entry/**` → Entry、`src/usecase/**` → Use case、`src/domain/**` → Domain、`src/infra/**` → Adapter / Infrastructure | 先に合ったruleを使う。ライブラリのconfig classはconfigのroleのままにする（config表示の切替で一緒に隠れる）。roleをglobで決めるか `@Config` から取るかは[5.2](#52-roleの決め方) |
| plugin `vitest` | Unitは `integration/ec-backend/src/**/*.test.ts`、E2Eは `integration/ec-backend/e2e/product.spec.ts` だけ | E2Eを1ファイルに絞るのは**サンプリング**（手書きの手間を減らすため）であり、抽出できないから外したのではない。抽出器は `e2e/**/*.spec.ts` 全体を対象にできる。範囲が一部なので、E2Eのcoverageは全routeで「一部のみ」（[付録G](#g-e2e)）。Unitは12ファイル・約212 caseを追加済みで、手書きfixtureへの反映は別作業（今のfixtureのUnit一覧は0件のまま） |
| plugin `http-requests` | appは `createTestApp`、helperは `authRequest`（app引数0・method引数2・path引数3）と `registerUser`・`loginUser`（固定のPOST・path） | [付録G](#g-e2e)の初版の範囲 |
| plugin `zelt` | appは `createEcApp`、`setupFiles` は空 | 現行のec-backendのVitest設定にsetupFiles指定がない。appを `zelt.config.ts` から読むかは[5.4](#54-zeltconfigtsとの二重管理) |

この例のtest範囲はアプリのコード（ec-backend）のtestだけで、ライブラリ自身のtestは入れない（[4.2](#42-ライブラリは接点だけから)）。未指定のtestまで「なし」と主張しない。requiredはcomplete-in-scopeを要求する機能。他の機能のpartialは配信してよいが、v1で見えるのはcoverageのstatusだけ。ライブラリを地図の内部として全メンバーまで展開したい場合は、includeへそのsourceを追加する（アプリのコードとして扱われる）。

### I. 組立

実装する②: ②4（矛盾は生成失敗、先勝ちしない。未解決を「なし」にしない。配信するrelationは実在IDだけを参照）。

組立は、コアの事実・pluginごとの材料の一覧・configを受け取り、1節の「JSONの書き手」どおりに1回でJSONを作る。書き手でない箱の値でJSONの部分を埋めない。矛盾があれば止める（all or nothing）。

~~~mermaid
flowchart LR
  I["コアの事実"] --> A["組立"]
  P["pluginの材料"] --> A
  C["config"] --> A
  A --> J["StudioSnapshot"]
  J --> O["publish"]
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
| 同じ材料 | コアの線は所有者＋to＋kind、付与された線は所有者＋to＋provider＋kind、意味はsubject＋provider＋kind、setupはsubject＋provider＋kind＋target、routeは登録ID、testはrunner＋登録＋caseKey、hintはsubject＋provider＋labelで併合。証拠は位置＋provider＋basisで重複排除 |
| 意味の付与 | 意味は対象（宣言・コアの線）の `meanings` に足すだけで、コアの種類は変えない。`read` に `schema` / `table` / `register` が付いても線は1本のまま。複数providerの意味は並ぶ |
| 付与された線 | 同じ2点・同じ向きにコアの線があれば契約違反（意味の付与にすべき材料）。2本にしない |
| 矛盾する材料 | 同じ登録を複数runnerが主張、同じtestのsetup経路に異なるtarget、同じroute登録IDに異なるmethod・path、同じclassをserviceとconfigの両方に分類、コアの事実を上書きする材料等は生成失敗。先勝ちにしない |
| 不明な事実 | partial＋診断。配信するrelationは必ず実在IDを参照。不明な相手への線は `unresolved` か報告だけに残す |
| coverage | scopeごとにrunner＋対応付けのreportを合成。どちらかpartialならpartial、機能が無効ならuncollected。testのsetupの未解決はcall対応を消さずsetup欄に残す |
| 機能の要求 | requiredの全reportがcomplete-in-scopeでなければpublishしない。設定にあるが未実装のplugin/featureはエラー |
| 入力の変更 | 読んだ全ソース・設定・metadata workerの入力を再hash。解析中に変わっていれば生成失敗、異なる版を混ぜない |
| 例外 | config/TS構文・解決の致命的エラー、plugin例外、worker timeout、invalid JSON、IO失敗は失敗として返す。空配列へのfallbackはしない |

### J. 生成とpublish

実装する②: ②4（失敗したら配信しない。同じ入力なら同じJSON）。生成はall or nothingで、失敗したら前回のJSONをそのまま残す（[4.4](#44-コードと一致するから)、ユーザー判断）。JSONの順序に表示の意味を持たせないことも確定（[4.6](#46-policyに根拠が無い結果)）。

実行コマンドは `zelt studio extract --config <config.json>`。成功はexit 0、生成失敗はexit 1。同じ出力先への同時生成は排他lockで拒否し、同じディレクトリの一時ファイルへ書いてschema再検証後にatomic renameする。失敗時は自分が作った一時ファイルだけ回収する。

解析用Programは指定tsconfigのmodule解決・target等を継承し、noEmit=true、rootDir/outDir/composite/incrementalの出力制約を外す。rootNamesはincludeの対象とtest/setup/helperの対象を合わせる。対象ファイルが0件、構文エラー、module未解決は生成失敗。意味解析の診断は報告へ残し、影響範囲の関係をpartialにする。

revision（内部）は、読み込んだソース・参照d.ts・package解決情報・tsconfigとextends・lockfile・抽出configを、正準path順の長さ付きUTF-8列としてSHA-256。plugin version/抽出器versionも含める。`snapshotId` はsnapshotId自身を除く全JSONをkey辞書順・配列の規定順で正規化してSHA-256。日時や絶対pathをhashに混ぜない。

出力順はgroupが正準filePath→ソース順、memberがソース順、relationはID順、testは登録位置/caseKey順、callsと根拠は位置順、hintsは[付録A](#注記の付与規則全表)の順、`meanings`・`setup` はprovider ID順で同provider内は根拠の位置順。JSON上の順序に表示の意味は持たせない（列内の並びはUIが計算）。plugin実行順を入れ替えても同じJSONにする。

### K. 作るコードの置き場所

実装する前提: 前提2（コア・組立はZeltを知らない）と1節の処理の形。UIはschemaだけに依存する。置き場所そのものは既存の抽出器との関係（[5.3](#53-既存の抽出器との関係)）に左右される。

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
| コア（TS索引・値追跡） | 同ディレクトリのindex.ts、origin.ts。metadataの既存解決処理は再利用可能な箇所だけ移植／共通化し、公開inspect APIは維持 |
| pluginと組立 | plugins/zelt.ts、vitest.ts、libraries.ts、requests.ts、assemble.ts。Zeltのruntime importはworker.ts内だけ |
| JSON契約 | 同ディレクトリのschema.ts。Valibot schemaを正とし、公開型はInferOutputで生成。ブラウザ用exportにTS/Node importを混ぜない |
| Zeltの読取API | [HTTP feature](../../packages/core/src/features/http/http.feature.ts)、[routing metadata](../../packages/core/src/features/http/routing/routing-metadata.lib.ts)、[eventbus feature](../../packages/eventbus/src/eventbus.feature.ts)、[class source](../../packages/decorator-metadata/src/inspect/class-source.lib.ts)。登録規則をruntimeと共有する |

schemaはCLIの専用subpathからexportし、UIはそこだけimportする。現在の[src/snapshot-schema.lib.ts](src/snapshot-schema.lib.ts)をそこへ移し、coreとUIで二重管理しない。UIへのビルド時依存であり、静的配信時にCLIやNodeは不要。

### L. UIの追従

実装する前提: 前提1（変えるのは[4.5](#45-v1からの変更)の変更への追従と、[4.6](#46-policyに根拠が無い結果)の表示の追従だけ）。v1のschema・fixture・UIの変更は、この文書の後の別作業。各行の根拠は4節の該当項目。

| 変更 | UIで変える場所 |
| --- | --- |
| schema | [snapshot-schema.lib.ts](src/snapshot-schema.lib.ts) に[付録A](#a-出力の形)の差分を反映 |
| 種類と意味の分離（線） | 線の表示名（[labels.ts](src/labels.ts)）を、`meanings` があればその表示名、無ければTSの種類から引く。付与された線（`origin: 'plugin'`）は種類から表示名を引き、知らない種類は種類の文字列をそのまま出す。線の種類を見ている箇所（[relations.lib.ts](src/relations.lib.ts)のチップ判定、[scope.lib.ts](src/scope.lib.ts)・[map-presenter.lib.ts](src/map-presenter.lib.ts)のmiddleware判定、[edges.lib.ts](src/edges.lib.ts)の併合キー）を、付与された線の種類で判定するよう追従する。見え方は変わらない |
| 種類と意味の分離（宣言） | 宣言の種類の表示（[labels.ts](src/labels.ts)の `SCHEMA`・`TABLE`・`EVENT TYPE`）を、`meanings` があればその表示名、無ければTSの種類から引く。見え方は変わらない |
| `setup` の追加 | 詳細パネル（[inspector.tsx](src/views/inspector.tsx)・[inspector-presenter.lib.ts](src/inspector-presenter.lib.ts)）にsetupの一覧を出す。地図は変えない。今のmockに無い表現なので、**先にmockで示す** |
| `expandedY` 削除 | [layout.lib.ts](src/layout.lib.ts)。列内のgroupをパスの名前順、同じファイル内はソース出現順（`startLine` の昇順）に並べ、y＝上端＋先行groupの現在の高さ＋gapの累積。高さの計算は既存の宣言・tagの寸法を使う。同じ入力と状態では同じ位置になり、選択による薄表示だけでは並べ替えない |
| `hint` → `hints` | [map-presenter.lib.ts](src/map-presenter.lib.ts)（宣言の補助ラベル）、[presenter.lib.ts](src/presenter.lib.ts)（検索対象の文字列と検索結果の補助表示）、[group-node.tsx](src/views/group-node.tsx)（表示）。labelを出すだけで、providerで分岐しない |
| `redacted` 削除 | UIは既に区別していないので型の追従だけ |
| `origin` 削除 | 参照箇所なし。型の追従だけ |
| `demoScenarios` 削除 | [graph.lib.ts](src/graph.lib.ts)、[presenter.lib.ts](src/presenter.lib.ts)、[map-presenter.lib.ts](src/map-presenter.lib.ts)、[preferences.lib.ts](src/preferences.lib.ts) の参照を外す |
| `entries` 削除: 起点ショートカット | [toolbar.tsx](src/views/toolbar.tsx)の起点select（`root-select`）と種類フィルタ（`EntryFilter`）、[presenter.lib.ts](src/presenter.lib.ts)の一覧作成、[navigation.lib.ts](src/navigation.lib.ts)の `entry.choose`、[preferences.lib.ts](src/preferences.lib.ts)の `entry.filter`、[graph.lib.ts](src/graph.lib.ts)の `entries` 索引、関連する型（`EntryKind`・イベント型）を外す |
| `entries` 削除: チップ | [relations.lib.ts](src/relations.lib.ts)の `isWarp` から「別groupの、入口を持つ宣言へのcallをチップにする」規則を外す。チップは関係の種類（`middleware`・`event`）だけで決める。fixtureでこの規則が効いている線は0本 |
| `e2eTests` の移動 | [test-presenter.lib.ts](src/test-presenter.lib.ts)の `endpointModels` を、http entryではなく宣言の `e2eTests` から読む。見出しは宣言の注記のlabel（複数なら ` · ` でつなぐ）、注記が無ければ宣言名（mockで実装済み） |
| 注記の複数行 | [group-node.tsx](src/views/group-node.tsx)の `member-hint` を注記ごとの行にし、[layout.lib.ts](src/layout.lib.ts)の行の高さ計算に注記の数を入れる（[4.6](#46-policyに根拠が無い結果)）。ec-backendでは複数の注記は起きない |
| IDの表示 | IDをそのまま出している箇所を名前の表示に替える（[4.6](#46-policyに根拠が無い結果)）。groupの見出し（[group-node.tsx](src/views/group-node.tsx)）、詳細の見出し（[inspector.tsx](src/views/inspector.tsx)）、検索結果（[toolbar.tsx](src/views/toolbar.tsx)。宣言は `所属groupの名前#宣言名`、groupは名前だけ）、検索の対象と lock 中の「固定基準」表示（[presenter.lib.ts](src/presenter.lib.ts)）、ミニマップの `aria-label`（[mini-map.tsx](src/views/mini-map.tsx)） |
| 展開class内のmember順 | [layout.lib.ts](src/layout.lib.ts)の行の積み上げと、[inspector-presenter.lib.ts](src/inspector-presenter.lib.ts)の詳細のメンバー一覧を、membersの配列順ではなく `startLine` の昇順にする（[4.6](#46-policyに根拠が無い結果)。mockで実装済み） |
| 手書きfixture | 自動抽出ができるまでコミットし続ける。UI追従と同時に、上の変更に合わせて形を移す。IDは短い形（`AuthController.register`、callbackは `OrderService.createOrder@callback:1`）のままで、抽出の形式（[付録B](#箱の切り方とid)）に変わるのは抽出器ができてfixtureを置き換えたとき |

維持するもの: middleware / event / config / compositionのtag、表示切替、app.ts非表示、Passive View/Mediatorの構成。

手書きfixtureを、この計画に合わせて直す必要がある箇所（別作業。この文書では直さない）:

| 箇所 | 直し方 | 根拠 |
| --- | --- | --- |
| `EcJwtConfig.resolveUser` → `@callback:0` の `returns` 1本 | 外す | 戻り値は型で表す（[4.1](#41-責務と流れから)） |
| 線・宣言の種類 | `schema`・`table`・`register`（`on()` への受け渡し）・`event-type` を、TSの種類（`read`・`value`・`signature`）＋ `meanings` に分ける。`middleware`・`event`・appへの `register` は付与された線（provider `zelt`）にする | [4.5](#45-v1からの変更) |
| `createEcApp` からの `register` 9本 | 付与された線（provider `zelt`）として残す | plugin:zeltが付与する線（[4.1](#41-責務と流れから)） |
| `setup` | constructorのinject、`@UseMiddleware`・`@RateLimit`、Configの差し替えをsetupとして足す | [4.1](#41-責務と流れから)・[付録D](#d-zelt) |
| productを送らない11 routeのE2E一覧（今は「未収録」） | 「一部のみ・0件」にする。productの5 routeも、範囲がサンプリングなので「一部のみ」 | [4.4](#44-コードと一致するから)・[付録G](#g-e2e) |
| Unit一覧（今は0件） | 追加した12ファイル・約212 caseを反映する | [4.4](#44-コードと一致するから)・[付録F](#f-unit) |
| E2Eの付与 | `beforeAll` のapp・テンプレート文字列のURL・局所helper経由のrequestも付ける | [付録G](#g-e2e) |

### M. 完了判定

実装する前提: 0節の完了の定義と前提1（今の手触りが保たれることを回帰検証する）。各行は4節の対応する結果の受入条件。

文書の型検査だけでは下表を達成したことにならない。実装時には実ソースfixtureからJSONを生成し、最後にブラウザで確かめる。

| 照合する場所 | 受入条件 |
| --- | --- |
| graph全体 | ec-backendのinclude範囲のclass/file/interfaceとmemberを列挙。1関数1宣言、callbackの包含、存在するIDへの参照を検証 |
| 注文取得 | findById→DrizzleService.dbのread、ordersへの `table` 線と `table` 宣言、Orderの型参照。架空のRepository/Portなし |
| 注文作成 | transaction/map等のcallbackが別の宣言で内部の依存を所有。折りたたみ時だけclass/fileへ集約 |
| HTTP / middleware | createEcAppの各routeと適用middlewareを、共通登録規則の期待値と照合。親子mount・skip・同名controller・同class複数mountも別fixtureで検証。route methodに `<METHOD> <path>` のhint |
| config | EcJwtConfig・EcCorsConfigからライブラリのJwtConfig・CorsConfigへのextends/overrideが残る。config表示を切っても実データは消さない。`src/config/` の原文は `declaration-only` |
| event | OrderHandlersの購読callbackと同じbusのemitを結ぶ。別busの同名eventは結ばない |
| hints | [付録A](#注記の付与規則全表)の表のlabelが該当宣言に付き、pluginを外すとそのproviderのhintだけが消える |
| Unit | アプリのtestのcase本文が直接呼んだ宣言にだけ付く。ライブラリの宣言は未収録のまま。setupのtarget由来とconfig差替えを保持し、通常のimport（joseなど）をoverridesへ入れない |
| E2E | 静的なdirect/helper request（`beforeAll` のapp・テンプレート文字列のURL・局所helperを含む）を、同じappでmethod・pathが一致するrouteを登録したmethodの `e2eTests` へ付ける。範囲がサンプリングなら全routeが「一部のみ」で、一致しないrouteは0件。未対応の経路はpartialとして見える |
| 任意plugin | Zelt無効でもコアの箱・ID・線・種類は同じで、そのpluginの付与だけが無くなる（[付録A](#pluginが無いときの値全表)）。appをimportしない。runner差替えの共通契約を偽pluginで検証 |
| 再現性と失敗 | plugin順を変えてbyte一致。不正ID/別revision/競合/worker失敗/required不足でpublishせず旧ファイルのhashが変わらない |
| Studio | 生成JSONをfetchし、今の手触り（選択近傍・双方向の独立再帰・lock・折りたたみ・可視tagだけの高さ・Unit/E2E一覧・reload）が保たれることを回帰検証。差分は[4.5](#45-v1からの変更)の変更点（起点ショートカットの削除、詳細パネルのsetupを含む）と、[4.6](#46-policyに根拠が無い結果)の表示の追従だけ |

実装順は依存する箱に沿って、schema（v1差分）＋UI追従＋fixture移行 → 索引 → plugin＋inspection → 組立/publish → 生成JSONへ切替。各箱の契約テストを先に置く。Vitest以外のrunner、任意JSの実行結果推定、testのin/out値収集、外部plugin配布は初版の完了条件に含めない。

### N. 実装時に決めること

②と前提の範囲内で、実装しながら詰めればよいもの。判断が要るものは[5節](#5-判断が要ること)にある。

| 項目 | 内容 | 関係する②・前提 |
| --- | --- | --- |
| `schemaVersion` | 1のまま据え置くか上げるか。UIとfixtureを同時に更新するので旧形式の互換読みは要らない | 前提1 |
| `event-type` のTSの種類 | [付録A](#pluginが無いときの値全表)の `signature` は、`order:created` がinterface memberであることからの推定。コアが実際に何の種別を返すかを確かめる | ②4 |
| 意味・付与された線・setupのkind | 付録Aのkind名（`schema`・`register`・`inject`・`config-override` 等）は案。kindを開いた文字列にするか、schemaで既知の値に閉じるか。UIの表示名の置き場（今は[labels.ts](src/labels.ts)） | ②4・前提1 |
| 1つの対象に異なる意味が並んだとき | 付録Aの形では複数providerの意味が並びうる。表示の仕方（ec-backendでは起きない） | 前提1 |
| `DI / 初期化` の注記 | setupができた後も注記として残すか | ②4・前提1 |
| write / setter / enum | 代入（write）はv1のrelation kindに無い（手書きfixtureは代入を線にも根拠にもしていない。`this.db = …`・`this.store = …`・`this.unsubscribes = []`）。setter・enumはv1の宣言kindに無い（ec-backendのsrcでは未発生）。readへ畳むか等 | 前提1・②4 |
| 動的なtest名 | v1の `TestIdentity.name` / `suite` はnullを許さない。静的に解けないeachのtemplate等の出し方 | ②4 |
| setupを照合できなかったcall | v1では各callに `setup` が必須で、`UnitSetup` はfactory callの `targetClass` と `location` を要求する。factoryを使わない・由来が解けないcallを何として出すか | ②1・②4 |
| 空の列 | [ec-backend.extract.json](ec-backend.extract.json)はfixtureの6列に「未分類」（fallback）の列を加えた7列。ec-backendでは未分類のgroupが無いので、fixtureはこの列を持たない。groupの無い列を配信から外すか、UIで詰めるか | ②3 |
| `returns` の型 | v1のrelation kindに `returns` が残る。抽出は出さない（[4.1](#41-責務と流れから)）。型から外すか、使われないまま残すか | 前提1 |
| E2E範囲がサンプリングであることの書き方 | [4.4](#44-コードと一致するから)の「一部のみ」を出すには、E2Eの範囲がe2e testの一部であることを抽出器が知る必要がある。configに明示するか、runnerの設定のtest対象と比べるか | ②4 |

### O. 今は扱わないもの

v1の形では表せないが、今は扱わないもの。構造変更を提案する場合は「手触りを保つ理由」と「汎用化に効く理由」の両方を書くこと（前提1の採用条件）。この文書では、4.5に挙げたもの以外の構造変更は提案しない。

| 項目 | v1で表せない点 | ec-backendで発生するか |
| --- | --- | --- |
| overload / declaration merge | `source.location` と `signature` が単数 | 発生している。ライブラリの `LifecycleManager.register` はoverload（fixtureは実装の宣言を採った）。`order.events.ts` の `declare module '@zeltjs/eventbus'` はdeclaration merge（fixtureはfile groupに置いた） |
| 複数app / 複数bus | relation・`e2eTests` にapp・busの区別が無い | 未発生 |
| CLI / schedulerからの呼出 | route以外の外からの呼出を表す置き場が無い（`entries` は廃止）。関数名から推測もしない | 未発生 |
| `UnitSetup` の形 | Zeltの `createTestTarget` を写した形（targetClass・configs・overrides）で、他のDI・test基盤のsetupを表せない | ec-backendはZeltなので問題にならない |
| partialの理由の置き場 | coverageはstatusだけで、何が取れなかったかを載せる場所が無い（報告はCLI出力にだけ残る） | 発生している。理由表示は手触りの変更なので、やるならmockが先 |
| testのskip / only / todo | `TestIdentity` に置き場が無い | 置き場なし |
| 列内の最適配置 | 理想はEntry列はパス順、他の列は矢印が最短になる配置。難しいので将来課題（ユーザー発言 2026-09-23）。今は全列をパス順にする | 未対応（全列パス順） |
| 列の中のサブレイヤー | 列の中をconfigのglob（例 `**/*.lib.ts`）で分ける置き場が無い。`requireUser`（`entry/controllers/current-user.lib.ts`）は入口ではなくEntry層のutilだが、今はcontrollerと同じ列に並ぶ。見た目の変更なので次のmockの課題。できたら「入口層へのcallをチップにするか」を再判断する（今Entry列を基準にチップ化すると `requireUser` への9本がチップになり手触りが変わるので、採らない） | 発生している（Entry列のutil） |

### P. 確認状況

2026-09-23時点（下の2026-09-24の項を除く）。

2026-09-24の変更（1節の責務の表、処理の形A、plugin は付与だけ、線・宣言の種類と付与された意味の分離、setup）は設計だけで、v1のschema・手書きfixture・UIには未反映（[付録L](#l-uiの追従)）。下の照合結果は、移行前の種類（`schema`・`register` 等を線の種類として持つ形）でのもの。

確認したこと:

- v1の型は `src/snapshot-schema.lib.ts` と照合した。[付録A](#a-出力の形)の差分以外は変えていない（mockは差分を反映済み）。
- 移行後の手書きfixture: 35 group（ライブラリ12）・130宣言・relation 238本。`expandedY`・`entries`・`demoScenarios`・`redacted`・`presentation.origin` は無い。宣言の `hints` は53件（DI 16・route 16・EVENT 1・core自動登録 2・valibot 6・drizzle 12）から、ライブラリの箱で消えたconstructorのDI 5件を引いた48件。groupの `hints` は全件空。excerptは宣言が `code` 124・`declaration-only` 6（すべて `src/config/`）、groupは41→35件すべて `declaration-only`。relation kindに `write` は無い。
- contractは `CartService` → `KVStore`（interface）の6本だけ。ホワイトリストのパッケージでアプリが呼ぶinterfaceのmemberは `KVStore` の3つだけ（`req.body()` の `RequestAccessor` は型alias、`requestContext()` の戻り値はhonoの型）。
- callbackの宣言は18個。ec-backendのsrcの引数callback 17個（TS Compiler APIで列挙）と、`EcJwtConfig.resolveUser` が返す関数1個。関係の所有は、各根拠の式の位置を実コードで引き直し、最内のcallbackと一致することを確かめた（186件）。
- ライブラリの箱（[4.2](#42-ライブラリは接点だけから)）: 移行前の外部18 groupから、アプリが使わない6 groupと、使わないメンバー43個、箱の中から出ていた線38本、ライブラリ自身のUnit test 6 case（`JwtService.sign` 1・`verify` 3・`decode` 2）を外した。
- routeの注記は、Zeltの `joinPath` と同じく末尾の `/` を付けない（`@Get('/')` は `GET /api/products`）。
- 3節の `AuthController.register` は、実コード（auth.controller.ts 13〜19行）とfixtureの該当宣言（call 1本・middleware 4本・schema 1本・注記 `POST /api/auth/register`・E2E「未収録」）を照合した。E2Eは「一部のみ・0件」に直す必要がある（4.4）。fixtureのgroupにparameter propertyの宣言は無い。
- ec-backendのsrcにsetter・enumは無い。
- E2E caseは延べ20件で、`product.spec.ts` のサンプリング（routeを登録した16 methodのうち5つに付き、fixtureは他の11を「未収録」にしている。「一部のみ・0件」に直す必要がある）。
- ec-backendのUnit testは12ファイル・212 case（`it`・`test` の呼出を文字列で数えた概数。`each` の展開を含まない）。fixtureは未反映。
- 4.1・4.6（旧5節）の件数: ec-backendのsrc（test除く）のparameter propertyはTS Compiler APIで数えて10 class・14件、それを読む組は延べ36（入れ子関数を外側に含めた数）。付録Aの注記規則で2つ以上付く宣言は無い。URLに保存するのは `node`・`root`・`mode`・`tab` で、未知IDは通知を出して初期表示のまま（e2e testあり）。
- 5.5（旧5.7）の件数は、ec-backendのsrcの文字列検索による概数。

- config＋規則との照合（[ec-backend.extract.json](ec-backend.extract.json)を読み、TS Compiler APIで宣言と線を導いてfixtureとdiffするスクリプト。pluginの事実はpackageのSymbolへの解決とdecoratorの構文で近似）: 列（IDとlabelと並び）・groupの列とrole・宣言のkind・excerptの `code` / `declaration-only`・注記はすべて一致（宣言130のうち `order:created` 以外の129）。E2E一覧を持つ宣言は、plugin:zeltのrouteを登録した16 methodと一致。線は238本中236本が一致。
- 照合で直したfixture: 同じ2点間の `read` と `register` の重複を `register` 1本に（1件、4.1）、classに付いた `@UseMiddleware` のmiddleware線の根拠をclassのdecoratorの行へ（8本）、使用箇所の一部しか並べていなかった根拠を全箇所に（15本）、代入の行を根拠にしていた `DrizzleService.constructor` → `sqlite` の根拠を読む行へ（1本）、`CartService.store: KVStore` の型参照の線を追加（1本）。規則側は、地図外に解決されるcallのcalleeへのreadを明記した（付録B）。このとき `returns` を「関数を返す」とした規則は、9/23の決定（戻り値は型で表す）で置き換えた。
- config＋規則で説明できないfixtureの箇所（fixtureは直していない）: `order:created` をfile groupに置いた（declaration merge、付録O）、emit/onのevent名から `order:created` への `type` 2本（根拠が相手側の宣言位置で、規則が無い）、overloadの `LifecycleManager.register` の所在を実装側にした（付録O）、`DrizzleService.db` の `typeof schema`（namespace import）への線が無い、`@Authorized()` が足す認可middlewareの扱い（classでなく関数のmiddleware）。
- 9/23の決定で解消した照合差: `inject(…)`・`@UseMiddleware(…)` に渡したclassへの `read` 22本はfixtureに無くてよい（classを値として渡す式は線にしない）。E2Eの付与（`beforeAll` のapp、テンプレート文字列のURL 4件、局所helper `createProduct` 経由6件）は付録Gの初版で結べるようにした。product以外の11 routeの「未収録」は「一部のみ・0件」に直す（付録L）。

未検証: 型ブロックと設定例の型検査（配信型の差分ブロックはv1の型を前提にしており単独では検査していない）、Mermaidの描画（構文は13図すべてmermaid 11.17.0のparseで確認済み、2026-09-24）、読みやすさのユーザー評価、抽出器の動作。受入条件はすべて未検証。
