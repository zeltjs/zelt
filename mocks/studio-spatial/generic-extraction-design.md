# Studio抽出設計 — 手書きsnapshotを実コードから生成する

## 0. やりたいこと・前提

この節では、何を作るかと、作業の前提を決める。前提はpolicy（2節）ではなく、この作業の枠。

Studio mockが読む `public/ec-backend.snapshot.json` は、**`zelt studio extract` が実コードから生成したJSON**である（2026-09-24に手書きfixtureから置き換え済み。[付録P](#p-確認状況)）。完了の定義「ec-backendから `zelt studio extract` でJSONを生成し、そのJSONをStudioで表示できること」は満たした。受入条件は[付録M](#m-完了判定)。

- **前提1 — 手触りは変えない**: 配信データの契約はv1（[`src/snapshot-schema.lib.ts`](src/snapshot-schema.lib.ts)）。v1からの変更は[4.5](#45-v1からの変更)に挙げたものだけで、形を変えるのは「手触りを保ち、かつ汎用化に効く」と示せたときだけ。
- **前提2 — 汎用化は抽出器の内部構造の話**: 抽出器を「コア（どのTSコードにも効く）＋任意plugin（Zelt・Vitest・Valibot・Drizzle等の意味）＋組立」に分ける。pluginは付与するだけで、無くても同じ型で地図は出て、意味が粗くなるだけ。
- **前提3 — snapshotは生成物**: `public/ec-backend.snapshot.json` は「[config](ec-backend.extract.json)＋この文書の規則」から生成する成果物で、手では編集しない。更新は `zelt studio extract` で行う（コマンドは[README](README.md)）。生成結果が期待と違うときは、JSONではなくconfigか抽出器を直す（[付録L](#l-uiの追従)・[付録P](#p-確認状況)）。

**読み方**: 1節は箱の責務、2節のpolicyが土台。3節はpolicyが1本の例でどう効くか、4節はpolicyから決まる結果。5節（判断が要ること）は空。付録は実装の細則でレビュー不要。

**「(AI 判断)」**: ユーザーに判断を戻さず、①②に照らして決めた箇所に付ける。理由を1行添える。

## 1. 全体の箱

この節では、抽出器を構成する箱の責務と、JSONのどこを誰が書くかを示す。矢印はデータの受渡しで、アプリ内の依存を描いた図とは別物。

**処理の形**: コアと各pluginが**材料**を出し、**組立**が1回でJSONを作る。pluginはJSONに触らず、コアの結果を読んで材料を返すだけ。

~~~mermaid
flowchart LR
  S["実コード"] --> CO["抽出器のコア"]
  S --> ZR["Zeltの出力"]
  CO -->|所在とID| ZP["Zelt plugin"]
  ZR -->|意味| ZP
  CO -->|読む| VP["Vitest plugin"]
  CO -->|事実| AS["組立"]
  ZP -->|材料| AS
  VP -->|材料| AS
  CF["config"] --> AS
  AS --> J["配信JSON"]
  J --> UI["UI"]
~~~

Valibot・Drizzleのpluginも、Vitestと同じ形でコアを読み、材料を組立に渡す。Zelt pluginだけは意味の出どころが違い、**Zelt自身の出力**（appを読み込んで得たblueprintとdecorator metadata）から意味を取る。コアからはIDと所在・原文だけを引き、TSのASTは読まない（[付録D](#d-zelt)）。

| 箱 | 責務 | 責務でないこと | 担う② |
| --- | --- | --- | --- |
| config | 人の意図: 境界（列と既定の表示）、気にするライブラリとignore、地図に載せる範囲、原文を見せる範囲 | コードの事実を書き足すこと | ②3、②2 |
| 抽出器のコア | TSとして確かめられる事実だけ: 宣言、呼ぶ・読む・型、所在と原文 | どのフレームワークの意味も知らない | ②1、②4 |
| plugin | 担当ライブラリの意味を付与する（下の5種）。そのライブラリで意識しなくてよいものを「ignore推奨」として出す | 他pluginの結果や事実の書き換え、コードに無いものを作ること、ignoreを勝手に適用すること | ②1、②2、②4 |
| 組立 | コアとpluginの材料を1枚の地図にまとめる。矛盾があればall or nothingで止める | 分からないことを「無い」に変えること | ②4 |
| UI | 見せ方: 並び、流れのたどり方、列の表示切替、付与された意味の表示 | データに表示用の値を持たせること | ②1 |

**pluginが付与するもの**: pluginは付与だけをする。コアの事実を書き換えない（「読む」を「登録」に置き換える、といった意味の変換はしない）。

- **意味**: 既存の線や宣言に意味を付ける（`on()` に渡した関数への「読む」に「登録」、Valibotのschemaに「schema」）。
- **線**: TSに根拠の無い関係を新しい線として付ける（middleware、event、appへの登録）。
- **注記**: 宣言の横に出す短いラベル（`POST /api/auth/register` など）。
- **testの対応の材料**: test名・直接呼んだ関数、testのsetupの差し替え。組立がUnit・E2Eの一覧を作る。
- **setup**: 流れとは別種の情報。inject・middleware指定・Configの差し替え・lifecycle登録。線にせず詳細パネルで見せる。

**JSONの書き手**: 各部分の書き手は1つに決まっている。

| JSONの部分 | 書き手 |
| --- | --- |
| 列（既定の表示を含む）・project | config |
| 箱・宣言・原文、呼ぶ・読む・型・契約の線 | コア |
| 意味・付与された線・注記・setup | plugin |
| Unit / E2E一覧・取得状況・全体ID | 組立 |

2つのpluginが同じ対象に食い違う材料を出したら、組立は矛盾として生成を止める（all or nothing）。

以降で使う言葉は4つ。

- **事実**: コードを読めば誰がやっても同じになるもの（「AがBを呼ぶ」「このmethodは `POST /api/auth/register` のrouteに登録されている」）。
- **意味**: 事実のうち、ライブラリを知って初めて分かるもの（「この値はValibotのschema」）。pluginが確かめて付与する。
- **列**: 地図の横位置（`Entry / Middleware`・`Use case`・`ライブラリ` など）。どのファイルをどの列に置くか、既定で見せるかは、人がconfigで決める。
- **ignore**: 地図で意識しないライブラリのexport。pluginが推奨を出し、採否は本人がconfigで決める。

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

**外界とライブラリは別物**: アーキテクチャ上の「外界」はDB・ネットワーク等で、adapter層がその接点（Q4）。ライブラリはnode_modulesの既製の部品（Q5）。ライブラリを別の列に置く理由は「責務が違う」ことで、ライブラリにこのプロジェクトの責務は無く、プロジェクトの責務はライブラリを選び適切に活用すること。この文書ではnode_modules側を「ライブラリ」と呼び、ec-backendのconfigの列名も「外部」から「ライブラリ」に変えた（AI 判断: 外界と混同しないため。②2）。

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

| 箱 | registerについて出すもの | 満たす② | 答える問い |
| --- | --- | --- | --- |
| コア | `AuthService.register` を呼ぶ線、`RegisterSchema`（変数）を読む線 | ②1 配線、②4 事実だけ | Q1 |
| plugin:zelt | 注記 `POST /api/auth/register`、middlewareの線2本、setup `@RateLimit(…)` | ②1 処理の入口と配線 | Q1・Q2 |
| plugin:valibot | `RegisterSchema` を読む線に、schemaの意味を付与 | ②2 ライブラリの活用 | Q5 |
| 組立 | 材料を1枚にまとめ、E2E testをrouteの一致で付ける | ②1 検証、②4 | Q6 |
| Studio | Entry列（configのglob）に置き、列と線を重ねて描く | ②3 | Q2 |

- `register` がどのURLのrouteに登録されているかは、TSだけでは分からない。plugin:zeltが、Zeltが実行時に持つroute・middlewareの登録情報を読んで付与する（②4）。middlewareは、app.tsで登録したLoggingと、`@RateLimit` が内部で付けるRateLimitの2本。appが書かずにcoreがrouterごとに先頭で登録する組込み（Cors・SecureHeaders）は地図に出さない（ユーザー判断 2026-09-24）。
- 線にしないもの: `this.authService` の読み取り（注入された値の置き場は責務ではない）、`request(…)` の呼出（Zelt pluginのignore推奨をconfigで採用）。`@RateLimit`・`inject(AuthService)` はsetupで、詳細パネルに出す（[4.1](#41-責務と流れから)）。

### 生成したsnapshotとの対応

`public/ec-backend.snapshot.json`（生成物）の `AuthController#register` は、この計画の形になっている。

| snapshotにあるもの | データの形 |
| --- | --- |
| `AuthService.register` へのcall | コアの線 |
| `RegisterSchema` への線 | コアの「読む」＋valibotが付与したschemaの意味。表示は今までどおり「入力検証schema参照」 |
| middleware線2本 | plugin:zeltが付与した線 |
| 注記 `POST /api/auth/register` | plugin:zeltの注記 |
| setup `@RateLimit({ limit: 3, … })` | plugin:zeltのsetup（target: RateLimitMiddleware） |
| E2E一覧 | configのE2E範囲は `product.spec.ts` のサンプリングなので「一部のみ・0件」 |

### pluginを外すと

Zeltのpluginを外すと、middleware線・注記・setup・E2E testの結び付きが消え、`register` は「AuthServiceを呼ぶmethod」としてだけ残る。Valibotのpluginを外すと、schemaの意味が付かず、線は「読む」と表示される。地図の形は同じまま粗くなるだけ（②4、前提2）。

E2Eで同じappに `POST /api/auth/register` を送るtestがあれば、そのtestは、このrouteを登録した `register` に付く。`AuthService.register` には付かない（②1 検証: そのtestが直接試した境界はrouteだけ）。

## 4. Policyから決まること

この節は「②を決めると、何がどう決まるか」に答える。4.1〜4.4は②の各項から決まる結果で、見出しに「← ②の何番（問い）」を付ける。4.5はv1からの変更、4.6は②に紐づかない前提・運用。規則の細部は付録に置く。

~~~mermaid
flowchart LR
  A["②1 責務と流れ"] --> R1["4.1 流れの表し方"]
  B["②2 ライブラリは接点だけ"] --> R2["4.2 ライブラリの載せ方"]
  C["②3 意図と事実を重ねる"] --> R3["4.3 境界と列の書き方"]
  D["②4 コードと一致する"] --> R4["4.4 確かめ方と止め方"]
  F["前提1 手触り"] --> R5["4.5 v1からの変更"]
  G["前提・運用"] --> R6["4.6 見せ方と運用"]
~~~

### 4.1 責務と流れから

②1は「流れは契約・配線・検証で表す」と決めた。ここから、どの線を引くか、何を線にしないか、testをどこに結ぶかが決まる。

#### 配線: 呼ぶ・読む・渡す ← ②1（Q1・Q2）

- **呼ぶ・読む**: コアが引く。「読む」はproperty・getter・変数と、値として渡した関数・method。
- **constructorも同じ関数**: constructorは他のmethodと同じ関数として扱う。本文の呼出（`kv.namespace('cart:')`、DB接続の作成）は流れの線になる（ユーザー確認 9/24）。
- **付与された線**: TSに根拠の無い配線（middlewareの適用、eventの配送、appへの登録）は、plugin:zeltが付与した線として持つ。
- **部品の組み方は線にしない**: `inject(X)`・`@UseMiddleware(X)`・`controllers: [X]` のようにclassを値として渡す式と、decoratorの式はコアの線にしない。これは処理の流れではなく部品の組み方で、その内容はsetupか付与された線として出る（②1。旧5.6から紐づけ）。

#### 契約: interfaceと型 ← ②1（Q3）

- **contract**: 呼んだ先がinterfaceのmemberなら、コアがそのcallを `contract`（破線）として出す。ec-backendでは `CartService` → `KVStore` の6本。
- **戻り値は型で表す**: 戻り値に関する線は「型」の線だけ。「関数を返す」（`returns`）という種類は持たない（ユーザー判断 9/23）。`EcJwtConfig.resolveUser` の戻り型はホワイトリスト外なので線は出ない（fixture反映済み）。

#### setup: 流れとは別に、詳細で見せる ← ②1（Q1）、②4

- setupは部品の組み方: constructorの既定引数 `= inject(X)`、decoratorの内容（`@UseMiddleware(X)`・`@RateLimit(…)`・`@Authorized(…)`）、Configの差し替え（`@Config extends JwtConfig`）。
- 地図の線にしない（②1が描くのは流れだけ）。消さずに、plugin:zeltが宣言・groupに付与して詳細パネルの「Setup」に出す（②4）。
- `lifecycle.register(this)` のようなZeltへの登録呼出は、Zelt pluginのignore推奨に入れ、代わりにsetup `lifecycle` として付与する（AI 判断: フレームワークへの登録は処理の流れではなく（②1）、setupに残せば事実は消えない（②4））。
- 注入された値の置き場（parameter property）は宣言にせず、途中の `this.authService` の読み取りも線にしない。

#### 検証: testの結び方 ← ②1（Q6）、②4

testは、そのtestが直接触った境界にだけ結ぶ（②4: 間接的に届いた関数まで「検証している」とは言えない）。

- **Unit**: case本文が直接呼んだ関数に付ける。本文に書いた無名関数（`expect(() => f()).toThrow()`）の中の呼出と、getterの読み取りも直接の呼出に数える（AI 判断: どちらも本文に書かれた検証コードで、呼んだ先をTSのSymbolで確かめられる。②1・②4）。
- **Unitの分類**: `createTestTarget` のsetupを値の由来で照合し、Solitary / Sociable とmock一覧を出す。DIを経由しない呼出（モジュール関数）は「関数」と分類する（AI 判断: setupが無いことを未判定と区別して見せる。②4）。
- **E2E**: testが送ったrequestのmethod・pathと、plugin:zeltのroute登録が同じappで一致したとき、そのrouteを登録したmethodに付ける。
- 結ぶのは組立。細部は[付録F](#f-unit)・[付録G](#g-e2e)。

#### 注記: 処理の入口と配線を示す ← ②1（Q1）、②2（Q5）

注記は、pluginが自分で確かめた事実からだけ付ける（②4）。routeの `POST /api/auth/register`、event購読の `EVENT order:created`、tableのtable名など。全規則は[付録A](#注記の付与規則全表)。

### 4.2 ライブラリは接点だけから

②2は「ライブラリにこのプロジェクトの責務はなく、出すのは選び方と活用の接点だけ」と決めた。ここから、どのライブラリを載せるか、何を意識しないか、どこに置くかが決まる。

#### 載せる範囲は本人が決める: ホワイトリストとignore ← ②2（Q5）、②3

- どのライブラリを気にするかは本人のレベル次第なので、本人がconfigで選ぶ（ユーザー判断 9/24）。honoのように十分に認知され関心を持たないものは見えるべきでない。Node標準・TS標準は載せない。
- **ホワイトリスト**: 地図に載せるpackageと、そのexportを選ぶ（AI 判断: 単位はexportまで。気にするかは本人が選ぶので、細かい単位の方が意図に合う。②2・②3）。
- **ignore**: pluginが、そのライブラリで常識として意識しないもの（Zeltなら `inject`・`request`・`currentUser`・`requestContext`・`LifecycleManager`・decorator）を「ignore推奨」として出す。採否は本人がconfigで決め、pluginは自動で適用しない（ユーザー判断 9/24。推奨はCLIの報告に出す（AI 判断: 意図は人が書く。②3））。
- ホワイトリストに無いもの・ignoreしたものへの線は引かず、未解決欄にも載せない。

#### ライブラリの箱と列 ← ②2（Q5）

- 箱に並べるのは、アプリのコードから直接参照されているメンバーだけ（「内部未展開」）。箱の中から出る線は辿らない。
- ライブラリは右端の「ライブラリ」列にまとめる。列なので、他の列と同じく隠せる（[4.3](#43-意図と事実を重ねるから)。ユーザー判断 9/24: Q1〜Q4を問うときに接点を隠せる）。
- ec-backendのライブラリの箱は11個（`LifecycleManager` はignoreで外れた）。

#### 活用は意味の付与で見せる ← ②2（Q5）、②4

- plugin:valibot・plugin:drizzleは、定義元のSymbolで確かめたときだけ、宣言とそれを読む線に `schema`・`table` の意味を付与する。
- ホワイトリストに入れていないライブラリ（drizzle-orm・valibot）でも、pluginを有効にすれば活用は意味として出る。箱は出ない。

#### ライブラリ自身のtestは収録しない ← ②2

ライブラリにこのプロジェクトの責務は無いので、その検証も地図に出さない（JwtServiceのUnit testなどは入れない）。

### 4.3 意図と事実を重ねるから

②3は「境界は人が書き、流れはコードの事実から取り、重ねて見せる」と決めた。ここから、configが書くものと、列の見せ方が決まる。

#### 列は人がconfigで決める。roleは持たない ← ②3（Q2・Q4）

- どのファイルをどの列に置くかは、configの順序付きglobで決める。抽出器は推測しない。
- 列より細かい区別（旧role の `config`・`composition`）は持たない（ユーザー判断 9/24）。
- 列ごとに「既定で隠すか」をconfigに書く（AI 判断: 最初に何を見せるかも境界の意図なので人が書く。②3）。

#### すべての列を表示 / 非表示で切り替える ← ②3、②4

- ライブラリ・Config・Compositionを含む全列にトグルを付ける（ユーザー判断 9/24）。隠した列は幅を取らない。
- 非表示の列とその関係は表示しない。隠した列の箱も、その箱への線も、それを示すチップ（middleware・eventのチップを含む）も出さない（ユーザー判断 9/24: 列を隠すのは、その列を視界から外して残りの列に集中するため。旧「設定との関係あり」チップと、その一般化の「<列名>との関係あり」チップは廃止）。データの関係は消さず、列を表示に戻せば線とチップも戻る。
- 隠した列があることは、操作列の列チェックボックスで分かる。地図の上に隠した列の案内は出さない（ユーザー判断 9/24）。
- 隠した列の宣言を検索・参照で選ぶと、その列を表示に戻す。

#### app.tsはComposition列に置く ← ②3

- app.ts（`app`）はconfigの列ルールで専用の「Composition」列に置き、既定で隠す（AI 判断: roleの代わりに列で表す。appへの登録の線は付与された線としてデータに残る。列を隠している間は線もチップも出ない。②3・②4）。
- 旧「アプリ構成」ボタンとダイアログは外し、列トグルと検索から辿る（AI 判断: 特別扱いを消す）。

#### 入口・範囲・線 ← ②1、②3

- 入口はEntry列にいる宣言で、別の一覧（`entries`）を持たない。HTTPのmethod・pathは注記に、E2E一覧は宣言に付く。
- `include` は「このプロジェクトのコード」の範囲。アプリのtestファイルは索引には入るが、箱にしない。
- configは境界だけを書き、線は足せない。意図と逆向きに境界を越える線は、そのまま地図に出る。
- `zelt.config.ts` と抽出configは別物のまま（ユーザー判断 9/24）。appをexportしている場所は抽出configのplugin:zeltに書く。

### 4.4 コードと一致するから

②4は「確かめられないものは載せない。分からないことは分からないと見せる」と決めた。

#### 事実はコア、意味はpluginが付与する ← ②4、前提2

- 宣言・線・包含・所在はコアがTSから取る。意味は、pluginが定義元のSymbolやZeltのruntime metadataで確かめたときだけ付与する。名前・接尾辞の見た目で判定しない。
- pluginを外せば、そのpluginの付与だけが消え、事実は同じまま残る（[付録A](#pluginが無いときの値全表)）。

#### 分からないものは、分からないと見せる ← ②4

- 解けなかった参照は「未解決」欄に理由付きで残す。偽の宣言を作って線をつなげない。
- 取りきれなかった範囲は「一部のみ」にする。取っていないものを「0件」や「なし」と見せない。
- **E2Eのサンプリング**: ec-backendのE2E範囲は `product.spec.ts` だけ（手間を減らすサンプリング）。どのrouteも「一部のみ」で、一致しないrouteは「一部のみ・0件」（ユーザー判断 9/23。fixture反映済み）。
- **Unit**: ec-backendの212 caseのうち151 caseが規則で宣言に結び付く（延べ211行）。schemaの `safeParse`、本物のapp経由のmiddleware、ライブラリだけを呼ぶcase等は結ばない（fixture反映済み）。

#### 生成はall or nothing ← ②4

- 事実や材料が矛盾したら、どちらかを採らずに生成を止める。結果は「前回のJSONを残す」か「前回も無く、今回も生成しない」のどちらか（ユーザー判断 9/24）。
- 解析中に入力が変わったら止める。同じ入力なら、pluginの順を変えても同じJSONになる。

#### コードに根拠の無い値は外す ← ②4

- 人の説明文だった `hint` は消え、pluginが確かめた注記（`hints`）だけが残る。`demoScenarios`（仮の変更）は外す。
- URLに保存したIDが今の地図に無ければ、通知を出して初期表示にする。

### 4.5 v1からの変更

前提1より、v1の形を変えるのは、コードに根拠の無い値の除去と、論証付きの構造変更だけ。すべてschema・fixture・UIに反映済み。型の差分は[付録A](#a-出力の形)。

**構造の変更**:

| v1の今 | 変更後 | 根拠 |
| --- | --- | --- |
| 線・宣言の種類に、TSの事実とライブラリの意味（schema・table・register・event-type）が混ざる | 種類はTSの事実だけ。ライブラリの意味は `meanings`（provider付き） | ユーザー判断 9/24 |
| middleware・event・appへの登録も線の種類の1つ | 付与された線（`origin: 'plugin'`、provider付き） | ユーザー判断 9/24 |
| constructor・decoratorの内容の置き場が無い | group・宣言の `setup`（provider付き） | ユーザー判断 9/24 |
| groupに `role`（regular・config・composition） | 削除。列に `initiallyHidden` | ユーザー判断 9/24、4.3 |
| 線の種類に `returns` | 削除。戻り値は `type` | ユーザー判断 9/23 |
| Unitのcallは必ずDIのsetupを持つ | DIを経由しない呼出は `setup: null` | 4.1（AI 判断） |

- **手触り**: UIは、付与された意味があればそれを、無ければTSの種類を表示する。地図の線と宣言の見え方は変わらない。
- **汎用化**: 種類からライブラリ固有の値が消え、どのライブラリの意味も同じ付与の形で足せる。新しいライブラリのためにv1の種類を増やさなくてよい。

**値の除去・移動**（9/23までに反映済み）: `expandedY`・`excerpt.kind: 'redacted'`・`presentation.origin`・`demoScenarios`・`entries` を削除、`hint` を `hints: { provider, label }[]` に置換、E2E一覧を宣言に移動。表は[付録A](#配信型の差分)。

### 4.6 見せ方と運用

②のどれにも紐づかない、見せ方・実装・運用の規則。policyではなく前提として置く。

| 項目 | 種類 | 根拠 |
| --- | --- | --- |
| 並び順と座標はUIが計算する（列内はパス順、同じファイルはソース順、展開したclassはファイルに書かれた順） | 見せ方 | ユーザー判断 9/23・9/24 |
| 注記は1つずつ行にする | 見せ方 | ユーザー判断 9/23 |
| IDは抽出の形式、古いURLは引き継がない、検索は `Group#func` 表記 | 実装・見せ方 | ユーザー判断 9/23 |
| チップは関係の種類だけで決め（相手が隠した列にあれば出さない）、注記には入れない | 見せ方 | ユーザー判断 9/23・9/24、4.3 |
| 原文を伏せる範囲はconfig（`redacted` の代わりに `declaration-only`） | 運用（秘密の保護） | ユーザー判断 9/23 |
| `presentation.origin`・`expandedY` の削除 | 前提（抽出で生成する） | ユーザー判断 9/23 |
| v1の形を保ち、構造変更は論証付きだけ | 前提1 | ユーザー判断 9/23 |
| 子プロセスはappをexportしたmoduleを1回評価するだけで、DBやネットワークに接続しないappを入力条件にする | 運用（抽出を安全に動かす） | [付録D](#d-zelt) |
| 既存の抽出器（DependencyGraph v3）を置き換えるか拡張するかは論点にしない | 前提（やり方の話） | ユーザー判断 9/24 |

## 5. 判断が要ること

なし。旧5節の論点の行き先:

| 旧 | 行き先 |
| --- | --- |
| 5.1 ライブラリを隠すトグル | 4.3（全列のトグル、ユーザー判断） |
| 5.2 roleの決め方 | 4.3（roleを廃止、ユーザー判断） |
| 5.3 既存の抽出器との関係 | 4.6（論点にしない、ユーザー判断） |
| 5.4 zelt.config.tsとの二重管理 | 4.3（別物のまま、ユーザー判断） |
| 5.5 setupと流れの境目 | 4.1（constructorは同じ関数、setupの範囲）、4.2（exportまでのホワイトリストとignore） |
| 5.6 policyに根拠が無い項目 | 4.1（部品の組み方は線にしない、②1に紐づけ）、4.6（残り） |

---


## 付録 実装詳細

**ここは4節の結果を実装に落としたもの。レビュー不要。** 各項の冒頭に、実装する②（と前提）を示す。②に紐づかない規則は[4.6](#46-見せ方と運用)に挙げた。

TypeScriptブロックには2種類ある。**配信型**（v1、UIが読む）と、**抽出器内部の型**（配信しない）。内部型のブロックには見出しで「内部」と書く。

| 付録 | 内容 |
| --- | --- |
| A | 出力の形（配信型の差分・各フィールドの書き手・付与と注記の全表） |
| B〜H | 各箱の取得方法（コア・plugin共通・Zelt・Library・Unit・E2E・config） |
| I〜M | 組立・生成・置き場所・UI追従・完了判定 |
| N〜P | 実装時に決めること・今は扱わないもの・確認状況 |

### A. 出力の形

実装する②: ②4（値の出どころは確かめた事実だけ。事実と付与を分けて持つ）、②1・②2（注記・付与された意味と線が示すもの）、②3（列と既定の表示はconfig）。形の変更の論証は[4.5](#45-v1からの変更)。

#### 配信型の差分

[src/snapshot-schema.lib.ts](src/snapshot-schema.lib.ts) に反映済み（Valibot schemaが正、型はInferOutput）。

| 変更 | 対象 | 理由 |
| --- | --- | --- |
| 分離 | 線 → コアの線（`origin: 'ts'`、種類はTSだけ＋ `meanings`）と付与された線（`origin: 'plugin'`、`provider`＋種類） | TSの種類は `call` `read` `type` `construct` `extends` `implements` `override` `contract`。`schema` `table` と `on()` への `register` は `read` に付与された意味、middleware・event・appへの `register` は付与された線（[4.5](#45-v1からの変更)） |
| 分離 | 宣言の `kind` → TSの種類だけ＋ `meanings` | 宣言の種類は `method` `constructor` `function` `callback` `property` `getter` `signature` `type` `value`。`schema` `table` `event-type` は付与された意味 |
| 追加 | group・宣言の `setup` | 部品の組み方。地図に描かず詳細パネルで見せる（[4.1](#41-責務と流れから)） |
| 削除 | `GroupPresentation.role` | 列より細かい区別を持たない（[4.3](#43-意図と事実を重ねるから)） |
| 追加 | `MapPresentation.columns[].initiallyHidden` | 既定で隠す列（configで人が書く。[4.3](#43-意図と事実を重ねるから)） |
| 削除 | relation kind `returns` | 戻り値は `type` で表す（[4.1](#41-責務と流れから)） |
| 変更 | `UnitTestCase.calls[].setup: UnitSetup \| null` | `null` はDIを経由しない呼出（モジュール関数）。UIは「関数」と分類する |
| 削除 | `GroupPresentation.expandedY`、`excerpt.kind: 'redacted'`、`presentation.origin`、`MapPresentation.demoScenarios`、`SourceDeclaration.entries` | 並び・座標はUIが計算、原文を伏せる範囲はconfig、UI未使用、変更はdiffで表す、入口はEntry列の宣言（9/23） |
| 移動 | `EntryPoint.e2eTests` → `SourceDeclaration.e2eTests: EndpointTests \| null` | routeを登録したmethodに付く。`null` はrouteを登録していない宣言 |
| 置換 | `presentation.hint` → `hints: { provider; label }[]` | pluginが自分の見つけた事実から付ける注記。UIはラベルを出すだけ |
| 追加 | `GrantedRelation.order: number \| null` | 実行時に通る順（0始まり。middlewareのchain位置）。順序を持たない付与された線は `null`（AI 判断: Q1「どの順に通るか」は事実なので、JSONの並びでなく値で持つ。②1・②4・[付録J](#j-生成とpublish)） |

配信型の差分（ここに無いv1の型はそのまま）:

~~~ts
interface Hint { readonly provider: string; readonly label: string }
// 付与された意味。UIはあれば先頭の kind の表示名を、無ければTSの種類を出す
interface Meaning { readonly provider: string; readonly kind: string }
type TsRelationKind =
  | 'call' | 'read' | 'type' | 'construct'
  | 'extends' | 'implements' | 'override' | 'contract';
type TsDeclarationKind =
  | 'method' | 'constructor' | 'function' | 'callback'
  | 'property' | 'getter' | 'signature' | 'type' | 'value';
interface TsRelation {
  readonly id: RelationId;
  readonly origin: 'ts';
  readonly to: SubjectId;
  readonly kind: TsRelationKind;
  readonly meanings: readonly Meaning[];
  readonly evidence: readonly RelationEvidence[];
}
interface GrantedRelation {
  readonly id: RelationId;
  readonly origin: 'plugin';
  readonly to: SubjectId;
  readonly provider: string;
  readonly kind: string;
  readonly order: number | null;
  readonly evidence: readonly RelationEvidence[];
}
type SourceRelation = TsRelation | GrantedRelation;
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
  readonly setup: readonly SetupItem[];
  readonly hints: readonly Hint[];
  readonly presentation: { readonly columnId: ColumnId };
}
interface SourceDeclaration {
  // v1の他フィールドは不変。entriesは持たない
  readonly kind: TsDeclarationKind;
  readonly meanings: readonly Meaning[];
  readonly relations: readonly SourceRelation[];
  readonly setup: readonly SetupItem[];
  readonly hints: readonly Hint[];
  readonly e2eTests: EndpointTests | null;
}
interface UnitTestCase extends TestIdentity {
  readonly calls: readonly { readonly setup: UnitSetup | null; readonly invocation: SourceLocation }[];
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
    readonly initiallyHidden: boolean;
  }[];
}
~~~

`SetupItem.target` は相手が地図に載っているときだけそのID、載っていなければ `null`（`label` だけで見せる）。`label` はpluginがコードの式から作る（例 `inject(AuthService)`、`@UseMiddleware(JwtMiddleware)`、`lifecycle.register(this)`）。意味・付与された線・setupの `kind` は開いた文字列で、表示名はUIの[labels.ts](src/labels.ts)が持ち、知らない種類は文字列をそのまま出す（AI 判断: 新しいpluginのためにschemaを変えなくてよい。前提2）。1つの対象に意味が複数並んだら先頭（provider ID順）を表示する（AI 判断: ec-backendでは起きず、並び順の規則で結果が一意に決まる。②4）。

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
| 線（`origin: 'ts'`） | コア | `call` `read` `type` `construct` `extends` `implements` `override` `contract`（呼んだ先がinterfaceのmember） |
| `meanings`（線・宣言） | plugin | [下の表](#付与の全表) |
| 付与された線（`origin: 'plugin'`） | plugin | [下の表](#付与の全表) |
| `setup`（group・宣言） | plugin | [下の表](#付与の全表) |
| relation `evidence` | コア／plugin | `location` は根拠の所在、`expression` はその範囲の原文 |
| `source.location` / `signature` | コア | 宣言の所在と契約 |
| 宣言の `source.excerpt` | コア（configの範囲で） | `sourceText` に合うファイルだけ `code`、他は `declaration-only` |
| groupの `source.excerpt` | 組立 | 常に `declaration-only`。groupは宣言ヘッダーとして扱い、本文は各メンバーで見る |
| `unresolved` | コア | 解けなかった参照（理由はv1の5種） |
| 宣言 `unitTests` | 組立（Vitest・Zeltの材料から） | case一覧はrunner、testのsetupはZelt、対応付けは組立（[付録F](#f-unit)）。DIを経由しない呼出は `setup: null`。ライブラリの宣言は常に未収録（`uncollected`） |
| 宣言 `e2eTests` | 組立（Zelt・Vitest・http-requestsの材料から） | routeを登録したmethodだけに付く（[付録G](#g-e2e)） |
| `hints`（group・宣言） | plugin | [下の表](#注記の付与規則全表) |
| `presentation.columnId`、`MapPresentation`（`initiallyHidden` を含む） | config | globのrulesとcolumns（[付録H](#h-config)）。groupの無い列は配信しない（AI 判断: 空の列は何も示さない。②1） |

#### 付与の全表

← ②1・②2（付与が示すもの）、②4（確かめた事実だけ）。件数は生成したsnapshotのもの。

| provider | 付与の種類 | 付与先 | kind | fixtureの件数 |
| --- | --- | --- | --- | --- |
| valibot | 意味 | valibotのschemaを作る変数の宣言と、それを読む線 | `schema` | 宣言6・線6 |
| drizzle | 意味 | table builderで作る変数の宣言と、それを読む線 | `table` | 宣言4・線17 |
| zelt | 意味 | `EventBusSchema` 拡張のmember | `event-type` | 宣言1 |
| zelt | 意味 | eventbusの `on()`・`once()` に渡した関数への「読む」 | `register` | 線1 |
| zelt | 線 | routeのcontroller method → middlewareの実行method | `middleware` | 62 |
| zelt | 線 | emitの所有者 → 購読callback | `event` | 1 |
| zelt | 線 | app → 登録したclass（controller・middleware・handler・adaptor・config） | `register` | 9 |
| zelt | setup | constructorの `inject(X)` の既定値 | `inject` | 16 |
| zelt | setup | class・methodの `@UseMiddleware(X)` とmiddlewareを付けるdecorator（`@RateLimit`・`@Authorized`） | `middleware` | 19 |
| zelt | setup | Configのclassが差し替えるlibraryのConfig | `config-override` | 2 |
| zelt | setup | ignore推奨にしたZeltへの登録呼出（`lifecycle.register(this)`） | `lifecycle` | 2 |

同じ2点にコアの線があるなら、pluginは新しい線ではなく意味を付与する（線を2本にしない）。

#### 注記の付与規則（全表）

← ②1・②2（注記が示すもの）、②4（確かめた事実だけ）。並び順の規則は出力の再現性のため（②4）。

hintsは、pluginが**自分で見つけた事実**からだけ付ける。人の説明文だったv1のhintは移行で消した（了承済み）。fixtureの `hints` は下表のlabelだけで46件。

| plugin | 付与先 | label | 生成したsnapshotでの例 |
| --- | --- | --- | --- |
| zelt | HTTP routeのcontroller method | `<METHOD> <fullPath>` | `POST /api/auth/register` |
| zelt | event購読のcallback | `EVENT <eventName>` | `EVENT order:created` |
| zelt | Injectableのmetadataを持つclass（`@Injectable`・`@Controller`・`@Middleware` はいずれも内部で `injectable()` を付ける）とConfigのconstructor | `DI / 初期化` | `AuthController.constructor` |
| drizzle | table宣言 | table名（table builderの第1引数） | `order_items` |
| drizzle | `$inferSelect` / `$inferInsert` から作ったtype | `DB schema由来` | `User`、`NewOrder` |
| valibot | `InferOutput` から作ったtype | `InferOutput<Schema名>` | `InferOutput<RegisterSchema>` |

- 同じ宣言に複数pluginが付けたら配列に並べる。並びはprovider ID順、同provider内は根拠の位置順。同じprovider・labelは1件にまとめる。
- lifecycle（起動・終了時の呼出）の登録には注記を付けない。旧fixtureの `lifecycle · 購読を登録` は人の説明を含むので、移行で外した。
- 移行後のfixtureのgroupの `hints` は全件空配列。group向けの付与規則は今は無く、型としてgroupにも置けるだけ。
- middleware / eventのチップ（UIの[relations.lib.ts](src/relations.lib.ts)の `attachments`）はhintsに入れない（[4.6](#46-見せ方と運用)）。付与された線と列の表示がSSOTであり、チップはUIが導出する表示。
- setupができても `DI / 初期化` の注記は残す（AI 判断: 地図の上で初期化の場所を示す要約で、詳細はsetupが持つ。地図の見え方を変えない。前提1）。

#### pluginが無いときの値（全表）

pluginは付与だけなので、pluginが無ければその付与が無くなるだけで、コアの事実と型は変わらない。

| 値 | 付けるplugin | pluginが無いとき |
| --- | --- | --- |
| `meanings` | valibot / drizzle / zelt | 空配列。UIはTSの種類を出す（schema・tableの宣言は `value`、線は `read`。`on()` への `register` は `read`。event-typeは `signature`） |
| 付与された線 | zelt | 無い |
| `setup` | zelt | 空配列 |
| `e2eTests` | zelt＋vitest＋http-requests | 全宣言で `null`（routeが分からず結ぶ先が無い） |
| `unitTests` | vitest＋zelt | casesは空、coverageは `uncollected`。vitestだけあればcaseは出て、callの `setup` は未判定（`unresolved`） |
| `hints` | 各plugin | 空配列 |
| ignore推奨 | 各plugin | 出ない。configに書いたignoreはそのまま効く |

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

実装する②: ②1（流れの線: 呼ぶ・読む・型・contract）、②4（構造はTSの事実から。解けない参照は `unresolved`）、②2（ライブラリの箱は接点だけ）。IDの形式は見せ方・実装の前提（[4.6](#46-見せ方と運用)）。

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

fixtureの短いIDからこの形へ変わることの扱いは[4.6](#46-見せ方と運用)。

#### 線の取得規則

| 線 | 機械的な取得方法と限界 |
| --- | --- |
| call / construct | getResolvedSignatureの宣言、alias解決後のSymbolへ。unionなどで実装候補が複数なら未解決。runtimeのoverride dispatchまでは保証しない |
| contract | call先の宣言がinterfaceのmemberなら、コアがその線を `call` ではなく `contract` として出す（TSの事実）。対象は地図に載っているinterfaceだけ（[4.1](#41-責務と流れから)・[4.2](#42-ライブラリは接点だけから)） |
| read | property・getter・変数のSymbolと、値として参照された関数・method。callee自身をreadとして二重化しないが、中間receiverのpropertyは読む。呼んだ先が地図に無い宣言に解決されるとき（`promisify` の戻り値を持つ `scryptAsync(…)` など）はcallを引かず、地図にあるcallee（変数）へのreadを残す。代入の左辺（write）は読みとして数えない（[付録N](#n-実装時に決めること)）。ただし相手がparameter propertyなら、宣言にしないので線を引かない（`unresolved` にも入れない） |
| classを値として渡す式 | `inject(X)`・`@UseMiddleware(X)`・`controllers: [X]` のように、classを値として参照する式は線にしない（`unresolved` にも入れない）。その意味はplugin:zeltがsetupか付与された線として出す（部品の組み方は流れではない。[4.1](#41-責務と流れから)） |
| decoratorの式 | decoratorの呼出と引数からは線を引かない（`unresolved` にも入れない）。TSの構文で決まり、フレームワークを知らなくてよい。内容はplugin:zeltがsetupとして付与する（[4.1](#41-責務と流れから)） |
| type | 型構文のSymbolを辿り、明示の戻り型を含めてtypeにする。関数を返す場合も、戻り値に関する線は型だけ（[4.1](#41-責務と流れから)。`EcJwtConfig.resolveUser` の戻り型の `JwtPayload`・`ResolveUserResult` は[ec-backend.extract.json](ec-backend.extract.json)で地図に載らないので線は出ず、返した関数はcallbackの宣言として包含で表れる）。型文字列を再parseしない。推論された複合型の内部依存までは収集しない |
| extends / implements / override | heritage句と基底memberのSymbolから。基底classの場所を「Port」へ移動しない |
| callbackへの関係 | 関数を値として渡すときは、無名callbackでも名前付きのmethod・関数でもreadを張る（[4.1](#41-責務と流れから)。plugin:zeltが `register` の意味を付与しうる）。返すときは線を引かない（包含で表す）。callは実行を静的に確認できた場合のみ。callback内の線を外側にも転記しない |
| 動的property / 関数を保持した変数 | 定数property名・不変aliasまでは解決。可変bindingや複数候補は `unresolved` |
| ライブラリ | 相手がホワイトリストのライブラリで、configのignoreに入っていなければ、その宣言をboundaryの箱のメンバーにする。箱にはアプリが直接参照したメンバーだけを入れ、箱の中から出る線は取らない。ホワイトリスト外・ignore・Node標準・TS標準の相手は線にも `unresolved` にもしない（[4.2](#42-ライブラリは接点だけから)）。ignoreしたclassのmemberへのcall（`lifecycle.register(this)`）も同じ |

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
// pluginが「このライブラリでは意識しなくてよい」とするexport。配信しない
interface IgnoreRecommendation { package: string; exports: string[] }
interface PluginResult {
  revision: string;
  materials: Material[];
  reports: AnalysisReport[];
  ignoreRecommendations: IgnoreRecommendation[];
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

hostがplugin.idとreport/evidenceのproviderの一致を検証する。索引にないID、別revision、宣言していないfeature、report欠落、scope外の読み取り、コアの事実を上書きする材料は契約違反。例外・不正ID・Zeltの子プロセスの失敗はpartialではなく生成失敗。失敗した新JSONは配信しない。

### D. Zelt

実装する②: ②1（route・middleware・event・appへの登録はフレームワークの配線、DI・decoratorはsetup）、②4（runtimeの記録という事実から付与する。名前一致で結ばない）。子プロセスの安全の制約は運用（[4.6](#46-見せ方と運用)）。

plugin:zeltは、Zeltが実行時に残した記録（blueprintのroute・decorator metadata・DI）をコアの宣言IDへ結び、意味・付与された線・注記・setupと、testの対応の材料（routeとDIの分類）を出す。コアの事実は書き換えない。contractはコアが引くので、plugin:zeltは扱わない（[4.1](#41-責務と流れから)）。classを値として渡す式とdecoratorの式はコアが線にしないので、その内容（DI・middleware・Configの差し替え）はここでsetupか付与された線として出す。

**pluginはTSのASTを読まない。** Zeltの意味はZelt自身の出力（blueprintとdecorator metadata）から取り、所在は「root相対path＋1始まりの行」だけを運ぶ。原文が要るところ（setupのlabel・根拠）はコアの所在と原文から引く。既存のStudio解析（[analyzer-entry.ts](../../packages/cli/src/studio/analyzer-entry.ts)）と同じやり方で、子プロセスがappを読む。

~~~mermaid
flowchart LR
  C["子プロセス（tsx）<br/>createApp() まで実行"] --> J["JSON<br/>ZeltInspection"]
  J --> B["コアの宣言に結ぶ<br/>export参照 → ID、行 → 所在"]
  B --> F["Zeltの材料"]
~~~

子プロセスが使うのは既存のAPIだけで、新設しない。

| 読むもの | 使うAPI |
| --- | --- |
| featureが登録したclass（controller・handler・adaptor） | `feature.featureClasses()` |
| app全体のmiddleware | `feature.globalMiddlewares()` |
| Config class | `app.configs` |
| routeのmethodとfullPath | blueprintの `getControllers()` と `getMetadata()` |
| decoratorの内容（`@UseMiddleware`・`@Authorized`・`@Controller`・`@Injectable` 等） | `getClassMetadata(cls)` |
| classの所在（module export。node_modulesのclassはpackageの公開entryに正規化される） | `getClassSource(cls)` |
| decoratorを書いた行 | `getDecoratorApplicationPosition(cls, target, matches)` |
| `inject()` の依存と行 | `getDependencySources(source, { tsconfig })` |
| Configが差し替える基底 | `Object.getPrototypeOf(cls)` |

子プロセスが返すJSON（[zelt-inspect-protocol.ts](../../packages/cli/src/studio/extraction/plugins/zelt-inspect-protocol.ts)、schemaを正とする）:

~~~ts
// package配下ならpackage名、そうでなければroot相対path
interface ZeltClassRef { package: string | null; filePath: string; exportName: string }
interface ZeltPosition { filePath: string; line: number }
interface ZeltMiddlewareUse {
  target: ZeltClassRef | null;               // 関数middlewareはnull
  on: { kind: 'class' } | { kind: 'method'; name: string };
  position: ZeltPosition | null;             // decoratorを書いた行
}
interface ZeltDependency { target: ZeltClassRef | null; localName: string; line: number }
interface ZeltClass {
  ref: ZeltClassRef;
  decorators: string[];                      // Controller / Injectable / Middleware / Config
  base: ZeltClassRef | null;
  dependencies: ZeltDependency[];
  middlewares: ZeltMiddlewareUse[];
  authorized: { methodName: string; position: ZeltPosition | null }[];
}
interface ZeltRoute {
  controller: ZeltClassRef; methodName: string; method: string; fullPath: string;
}
interface ZeltInspection {
  applicationId: Id;
  app: ExportReference;
  registered: ZeltClassRef[];                // featureClasses + app middlewares + configs
  globalMiddlewares: ZeltClassRef[];         // appが書いた登録順
  classes: ZeltClass[];
  routes: ZeltRoute[];
  diagnostics: { code: string; message: string }[];
}
~~~

`applicationId` はconfigで付けるappの名前で、内部の照合キー。v1には出ない（1 appの前提。[付録O](#o-今は扱わないもの)）。

コアが出す引き口（pluginがASTを歩かないために必要な最小限）:

~~~ts
interface CoreSourceSite { span: Span; text: string }        // 所在と原文の1行目
interface CoreDeclarationSite extends CoreSourceSite { id: Id | null }
type SetupSiteKind = 'parameter-default' | 'decorator' | 'extends' | 'implements';
interface CoreSetupSite extends CoreSourceSite { kind: SetupSiteKind }
// CoreResolver に足すもの
exportSite(ref: ExportReference): CoreDeclarationSite | null;
memberSite(ref: ExportReference, member: string): CoreDeclarationSite | null;
setupSites(id: Id): CoreSetupSite[];                          // 宣言に書かれたdecorator・継承・既定値
mentionSites(ownerId: Id, ref: ExportReference): CoreSourceSite[];  // classを値として書いた箇所
~~~

| 境界 | 実装する規則 |
| --- | --- |
| 子プロセスの起動 | tsxで専用processを起動し、configの `applications[].app` がexportしているappを読む（`createApp()` の戻り値そのもの。appを作る関数は要求しない）。createRuntime/realize・サービス生成・getter評価・test実行はしない。結果はマーカー行のJSON、ログはstderrに分ける。timeout（configの `timeoutMs`）・import失敗・壊れた応答は全featureをpartialにして生成失敗にする |
| runtimeとsource | 子プロセスはappの位置から解決した `@zeltjs/decorator-metadata` を動的importする。decorator metadataはmoduleごとのWeakMapに入るので、別instanceだと記録が空に見える（AI 判断: CLI側のcopyを静的importすると、file:・workspaceで実体が分かれて記録を読めない。②4の「取れないものを取れたことにしない」） |
| 読取対象のclass | 登録されたclassとglobal middlewareを起点に、`inject()` の依存をたどって集める。packageのclassは境界の箱なので中の配線はたどらない。意味を付けるのはconfigの `include` に入るclassだけ（ライブラリのclassにDIの意味は付けない） |
| classの同定 | `getClassSource` のmodule exportで同定する。`package` が付いた参照はconfigの `sourceModules` で索引のmoduleへ移し、`exportSite`／`memberSite` でIDを引く。`sourceModules` に無いpackageは地図に載らないので線を引かず報告に残す。名前一致では結ばない |
| HTTP route | blueprintの `getControllers()` と `getMetadata()` を同じ位置で対応させる（名前が食い違えば報告してskip）。method・fullPathはblueprintの値をそのまま使い、pathの結合規則を再実装しない。controller methodに hint `<METHOD> <fullPath>`。E2E照合用に、app・method・pathを持つrouteの材料を返す（配信しない） |
| middlewareの順 | route全体を通る順は、router全体（appの `middlewares`）→ controllerの `@UseMiddleware` → methodの `@UseMiddleware` → `@Authorized`。これはZeltの登録の仕方（http.serviceがrouterに `use`、route-builderがrouteのchainに積む）の組み合わせで、pluginが知っていてよい知識。coreがrouterごとに先頭で登録する組込み（`CorsMiddleware`・`SecureHeadersMiddleware`）はこのchainに入れない（ユーザー判断 2026-09-24: appが書いていないものは地図に出さない）。したがって `order` は、組込みを除いた並びの0始まりの位置 |
| middlewareの線 | routeのcontroller method → middleware実行method（`use`）へ、付与された線 `middleware`。chain内の位置を `order` に入れ、解決できなかった要素でも位置は詰めない |
| 根拠の所在 | decoratorはそれを書いた行（`getDecoratorApplicationPosition`）の `setupSites`、appの登録式は `mentionSites`。登録式が引けないときだけmiddlewareの宣言に落とす |
| DI/config | metadataのInjectable/Configの分類（材料 `di`、配信しない）。Injectableのmetadataを持つclass（`@Injectable`・`@Controller`・`@Middleware` はいずれも内部で `injectable()` を付ける）とConfigのconstructorに hint `DI / 初期化` |
| setup | inject呼出 → constructorに `inject`（targetは注入するclass、地図に無ければ `null`）。`@UseMiddleware` とmiddlewareを付けるdecorator（`@RateLimit`・`@Authorized` 等） → そのclass・methodに `middleware`（targetはmiddleware class。関数のmiddlewareは `null`）。Configのclassが差し替えるlibraryのConfig → そのclassに `config-override`。ignoreしたZeltへの登録呼出（`lifecycle.register(this)`） → その関数に `lifecycle`。labelはコアが持つ原文の行から作る。地図の線にはしない（[4.1](#41-責務と流れから)） |
| register | eventbusの `on()`・`once()` に渡した購読callbackへのコアの `read` に、意味 `register` を付与する（線は1本のまま。[4.1](#41-責務と流れから)）。appが登録したclass（controller・middleware・handler・adaptor・config）はコアの線が無いので、付与された線 `register` として足す |
| event | emit/onのSymbolと注入先busを照合する。同じapp＋一意に解決した登録provider＋静的event名でのみ、emitの所有者 → 購読callbackへ付与された線 `event`。購読callbackに hint `EVENT <eventName>`。`EventBusSchema` 拡張のmemberに意味 `event-type` を付与する（型引数・宣言の解決による。event文字列と同名のtypeを探して結ばない） |
| lifecycle | 入口としては出さない（`entries` を廃止したため）。注記も付けない（[付録A](#注記の付与規則全表)）。`LifecycleManager` はignore推奨で、`lifecycle.register(this)` はsetup `lifecycle` になる |
| ignore推奨 | `@zeltjs/core` の `inject`・`request`・`currentUser`・`requestContext`・`LifecycleManager`、route・DI・middlewareのdecorator（`Controller`・`Get`・`Post`・`Put`・`Delete`・`UseMiddleware`・`Authorized`・`Injectable`・`Middleware`・`Config`）、`@zeltjs/rate-limit` の `RateLimit`。CLIの報告に出し、configへの採用は本人が行う（[4.2](#42-ライブラリは接点だけから)） |

event購読のbusはadaptorのgroup ID（内部の照合用）。同じappで同じproviderに複数のbus登録があり、注入先を一意に決められなければpartialにする。busを表す架空の宣言は作らない。

**coreには何も足さない**: appが書かずにcoreがrouterごとに先頭で登録する組込みmiddleware（`CorsMiddleware`・`SecureHeadersMiddleware`）は地図に出さないと決めた（ユーザー判断 2026-09-24）ので、子プロセスはそれを知る読み取り口を必要としない。[http.service.ts](../../packages/core/src/features/http/http.service.ts) の登録はcreateLocalRouter内のローカル定数のままでよい。

子プロセスはOSのsandboxではなく、moduleのトップレベル副作用は起こりうる。Zelt無効時は子プロセスもapp importも行わない。DBやネットワークへ接続しないappを入力条件とする。

**event・lifecycle・Unitのsetupは今回の作り直しに含めない**（別に扱う）。この3つは作り直し前のTSの読み方を[zelt-eventbus.lib.ts](../../packages/cli/src/studio/extraction/plugins/zelt-eventbus.lib.ts)・[zelt-lifecycle.lib.ts](../../packages/cli/src/studio/extraction/plugins/zelt-lifecycle.lib.ts)・[zelt-test-setup.lib.ts](../../packages/cli/src/studio/extraction/plugins/zelt-test-setup.lib.ts)に残している。

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
| Unit対象 | case本文に字句的に含まれる、収録したapp宣言への呼出を一覧化。本文に書いた無名関数（`expect(() => f()).toThrow()`・`runInContext(() => f())`）の中も含め、getterの読み取りも呼出に数える（[4.1](#41-責務と流れから)、AI 判断）。本文の外で定義したhelperの先・hook内には降りない。同じcaseの同じtargetは一行、callsへ集約 |
| receiver由来 | binding Symbolを使い、await/括弧/type assertion、変数代入、不変alias、静的property経路を追う。caseごとに外部bindingをunknownへ戻し、beforeEachから開始 |
| 未対応の由来 | 分岐・loop・動的property・分割代入・helperを経た代入は未解決。alias書換え、closure共有、非await非同期処理、opaque関数へのescapeが関係すればshared-state |
| setup照合 | factoryCall＋resultPathが一致し、呼出先の所属classとも矛盾しなければ付与。型が同じだけの別instanceへは付けない |
| Zelt factory | import SymbolでcreateTestTargetを特定。第一引数のclass、optionsのconfigs/overrides、返却値のtarget経路を読む。testを実行しない |
| Zelt詳細 | targetの直接DI（constructor省略時は基底classのconstructor）、明示configs、setupFilesのconfigureTestDefaultsを読む。定数array/object/alias/spreadまで。動的値・解けない継承・global defaultsの読取漏れがあればunresolved。configでignoreしたclass（`LifecycleManager`）はdependenciesに入れない（AI 判断: 地図で意識しないものでSolitary/Sociableを変えない。②2） |
| receiverの無い呼出 | モジュール関数の直接呼出（`requireUser()`）は `setup: null`。UIは分類「関数」、mock対象「—」を出す（[4.1](#41-責務と流れから)、AI 判断） |
| `testTarget.get(X)` | factoryの戻り値の `get(X)` で取り出した値も同じfactoryの由来とし、呼出先の所属classが `X` と一致するときだけsetupを付ける（AI 判断: `target` と同じく値の由来で確かめられる。②4） |

setup機能が無効ならnot-collected。factoryに対応できてもDI等が不明ならunresolved。**未取得のdependenciesを空にしてSolitaryとは判定しない。**

Solitary/Sociableと mock一覧はUIがsetupから算出する（v1のまま）。抽出側は、config差替えとjose等の通常importをoverridesに入れない。overridesはserviceの差替え対象classだけで、useValueの中身は配信しない。

収録するのはアプリのコードのtestだけで、ライブラリ自身のtestは対象外（[4.2](#42-ライブラリは接点だけから)）。ec-backendのUnit testは12ファイル・212 caseで、この規則で151 caseが25宣言に結び付く（延べ211行、fixture反映済み）。結ばない61 caseは、schemaの `safeParse`（valibotの呼出で、schemaの宣言を呼んでいない）38、本物のapp経由のLoggingMiddleware 8、ライブラリの呼出やpropertyの読取だけのcase 15（`bus.emit` で購読callbackを間接に動かす、`drizzle.db` を読む等）。

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

実装する②: ②3（列と既定の表示は人の意図。線は書けない）、②2（載せるライブラリとignoreの選択）、②1（「このプロジェクト」の範囲）。原文の範囲は運用（[4.6](#46-見せ方と運用)）。列内の並び順をconfigで決めないことは確定（[4.6](#46-見せ方と運用)）。

configは、何を収録するか（地図に載せるライブラリを含む）・原文をどこまで出すか・どのpluginを使うか・どの列に置くかを人が決める場所。

~~~mermaid
flowchart LR
  F["実ソースのfilePath"] --> R["順序付きglob rules<br/>最初に合うルール"]
  R --> P["GroupPresentation<br/>columnId"]
  P --> U["UIのlayout<br/>列内の並び順（パスとソース位置から）<br/>+ 表示中の高さ"]
  C["columns<br/>id / label / width"] --> U
~~~

内部型:

~~~ts
interface PresentationRule {
  files: string[];
  columnId: string;
}
interface PresentationConfig {
  id: string;
  columns: { id: string; label: string; width: number; initiallyHidden: boolean }[];
  rules: PresentationRule[];
  fallbackColumnId: string;
}
// exportsに無いexport（関数・decorator・型）は地図に載せない
interface MapPackage {
  package: string;
  exports: string[];
}
// pluginのignore推奨から本人が採用したもの。線も未解決も出さない
interface IgnoredExports {
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
  ignore: IgnoredExports[];
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
  | { id: 'zelt'; applications: { id: Id; app: ExportReference }[];
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

`presentation` は `MapPresentation { id, columns }` と各groupの `presentation { columnId }` にそのまま出る。groupの無い列は配信しない。

globはpicomatchのPOSIX・case-sensitive・dot=true、否定はexcludeだけで扱う。groupには最初に合ったruleのcolumnIdを付ける。fallbackColumnIdを必須にし、未分類を勝手にUse caseへ置かない。

configのrootはconfigファイルから解決する。他のpath/globはroot基準。重複column ID・存在しないcolumn・重複plugin ID・project外へのoutputはエラー。sourceModulesは完全一致のpackage specifierをkeyにする。subpathは別keyで指定する。

`mapPackages` と `sourceModules` は役割が違う。

- `mapPackages`（ホワイトリスト）は**地図に載せるか**を決める。package名と、そのpackageのentry（`sourceModules` で解決した先）から地図に載せるexport名を指定する（単位はexportまで。[4.2](#42-ライブラリは接点だけから)）。載るのは列挙したclass・interfaceと、アプリが直接参照したそのメンバーだけ（[4.2](#42-ライブラリは接点だけから)）。存在しないexport名はエラー。Node標準・TS標準は指定できない。
- `sourceModules` は**どこからソースを読むか**（TSの解決と、runtimeのpackage参照を索引のmoduleへ移す対応）を決める。ここにあっても `mapPackages` に無ければ地図には載らない（例の `@zeltjs/testing`・`@zeltjs/decorator-metadata` は解決のためだけにある）。
- `ignore` は**地図で意識しないもの**。pluginのignore推奨から本人が採用する。ホワイトリストより優先し、ignoreしたexport（classならそのmemberも）への線・未解決は出さない。DIのdependenciesからも外す。
- `mapPackages` にあって `sourceModules` に無いpackageは、通常の解決（`node_modules` の型定義）の所在で箱になる。
- 載せたpackageのファイルをどの列に置くかは、他のファイルと同じ列ルール（globはsourceModulesで解決した先のpath）で決める。

設定にないpluginはdisabled。ZeltのsetupDetails=falseはtest-setupsをuncollectedとし、factory/targetの対応だけは返してよい。Vitestの実行設定は自動でserialにせず、利用中のrunner設定を明示する。setupFilesはrunner側の設定と一致させ、未指定のglobal defaultを不存在扱いしない。

ec-backendの設定は[ec-backend.extract.json](ec-backend.extract.json)（上のExtractConfigに適合する）。設定例はこのファイルだけに置き、ここには要点だけを書く。配信しているsnapshotは、このconfigとこの文書の規則から生成したものである（結果は[付録P](#p-確認状況)）。

| 項目 | ec-backendでの値 | 理由 |
| --- | --- | --- |
| `root` | `../..`（configファイルの置き場所 `mocks/studio-spatial/` から見たrepository root） | srcと参照先のpackage sourceを同じProgramで解決する |
| `include` / `exclude` | `integration/ec-backend/src/**/*.ts`、`**/*.test.ts` を除く | アプリのコードだけを「全メンバーを載せる宣言」にする。testは索引には入るが地図に出さない |
| `mapPackages` | `@zeltjs/core`（`LoggerService`・`CorsMiddleware`・`SecureHeadersMiddleware`・`CorsConfig`）、`@zeltjs/auth-jwt`（`JwtMiddleware`・`JwtService`・`JwtConfig`）、`@zeltjs/kv`（`KVStore`・`MemoryKVAdaptor`）、`@zeltjs/eventbus`（`MemoryEventBusAdaptor`）、`@zeltjs/rate-limit`（`RateLimitMiddleware`） | 関数・decorator・型（`inject`・`request`・`Controller`・`Lifecycle`・`JwtPayload` 等）は載せない |
| `ignore` | Zelt pluginの推奨をそのまま採用（[付録D](#d-zelt)） | 効くのは主に `LifecycleManager`（`lifecycle.register(this)` の線と箱が消え、setupになる）。他はホワイトリストにも無いが、ホワイトリストをpackage単位に広げても出ないように書いておく |
| `sourceText` | app.ts・domain・entry・infra・usecaseと、載せた5 packageの `src/**` | `src/config/` は外して `declaration-only`（v1の `redacted` の代わり）。ライブラリの箱も原文を見せるのでpackageのsourceを入れる。外部公開時は空にする |
| `presentation.columns` | `column:composition` Composition（既定で非表示）、`column:0` Entry / Middleware、`column:1` Use case、`column:2` Domain、`column:4` Adapter / Infrastructure、`column:5` Config、`column:6` ライブラリ、`column:other` 未分類（すべて幅310） | `column:3` は旧 `Port / interface` 列の跡で欠番。Compositionを左端に置くのは、appの登録が各列へ向かう線になるから（AI 判断: 表示したとき線が左から右へ流れる。②3） |
| `presentation.rules` | app.ts → Composition、`packages/**` → ライブラリ、`src/config/**` → Config、`src/entry/**` → Entry、`src/usecase/**` → Use case、`src/domain/**` → Domain、`src/infra/**` → Adapter / Infrastructure | 先に合ったruleを使う。ライブラリのconfig class（`JwtConfig`・`CorsConfig`）はライブラリ列にあり、Config列を隠しても隠れない（roleの廃止による） |
| plugin `vitest` | Unitは `integration/ec-backend/src/**/*.test.ts`、E2Eは `integration/ec-backend/e2e/product.spec.ts` だけ | E2Eを1ファイルに絞るのは**サンプリング**であり（当初は手書きの手間を減らすため。生成へ置き換えたあともconfigは変えていない）、抽出できないから外したのではない。抽出器は `e2e/**/*.spec.ts` 全体を対象にできる。範囲が一部なので、E2Eのcoverageは全routeで「一部のみ」（[付録G](#g-e2e)）。Unitは12ファイル・212 caseで、snapshotに入っている（[付録F](#f-unit)） |
| plugin `http-requests` | appは `createTestApp`、helperは `authRequest`（app引数0・method引数2・path引数3）と `registerUser`・`loginUser`（固定のPOST・path） | [付録G](#g-e2e)の初版の範囲 |
| plugin `zelt` | appは `app`（`app.ts` のexport）、`setupFiles` は空 | 現行のec-backendのVitest設定にsetupFiles指定がない。`zelt.config.ts` とは別物のまま（ユーザー判断 9/24） |

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
| 入力の変更 | 読んだ全ソース・設定・子プロセスの入力を再hash。解析中に変わっていれば生成失敗、異なる版を混ぜない |
| 例外 | config/TS構文・解決の致命的エラー、plugin例外、子プロセスのtimeout、invalid JSON、IO失敗は失敗として返す。空配列へのfallbackはしない |

### J. 生成とpublish

実装する②: ②4（失敗したら配信しない。同じ入力なら同じJSON）。生成はall or nothingで、失敗したら前回のJSONをそのまま残す（[4.4](#44-コードと一致するから)、ユーザー判断）。JSONの順序に表示の意味を持たせないことも確定（[4.6](#46-見せ方と運用)）。

実行コマンドは `zelt studio extract --config <config.json>`。成功はexit 0、生成失敗はexit 1。同じ出力先への同時生成は排他lockで拒否し、同じディレクトリの一時ファイルへ書いてschema再検証後にatomic renameする。失敗時は自分が作った一時ファイルだけ回収する。

解析用Programは指定tsconfigのmodule解決・target等を継承し、noEmit=true、rootDir/outDir/composite/incrementalの出力制約を外す。rootNamesはincludeの対象とtest/setup/helperの対象を合わせる。対象ファイルが0件、構文エラー、module未解決は生成失敗。意味解析の診断は報告へ残し、影響範囲の関係をpartialにする。

revision（内部）は、読み込んだソース・参照d.ts・package解決情報・tsconfigとextends・lockfile・抽出configを、正準path順の長さ付きUTF-8列としてSHA-256。plugin version/抽出器versionも含める。`snapshotId` はsnapshotId自身を除く全JSONをkey辞書順・配列の規定順で正規化してSHA-256。日時や絶対pathをhashに混ぜない。

出力順はgroupが正準filePath→ソース順、memberがソース順、relationはID順、testは登録位置/caseKey順、callsと根拠は位置順、hintsは[付録A](#注記の付与規則全表)の順、`meanings`・`setup` はprovider ID順で同provider内は根拠の位置順。JSON上の順序に表示の意味は持たせない（列内の並びはUIが計算）。plugin実行順を入れ替えても同じJSONにする。

順序そのものが事実である関係（middlewareのchain）は `GrantedRelation.order` に値として持ち、UIはそれで並べる（AI 判断: ID順に並べるとJwtがLoggingより前に来て実際の適用順と食い違い、Q1の答えを誤らせるため。②1・②4）。同じ相手への線が複数のrouteで位置違いなら、併合後は最も早い位置を残す。

### K. 作るコードの置き場所

実装する前提: 前提2（コア・組立はZeltを知らない）と1節の処理の形。UIはschemaだけに依存する。既存の抽出器（DependencyGraph v3）を置き換えるか拡張するかは論点にしない（[4.6](#46-見せ方と運用)）。

CLI内の独立モジュールとして置き、package公開やplugin配布機構は増やさない。

~~~mermaid
flowchart TB
  CLI["CLI: studio extract<br/>config読取・publish"] --> CORE["extraction/core<br/>schema / 索引 / 組立<br/>TSの知識。Zelt importなし"]
  CLI --> PLUGINS["extraction/plugins<br/>zelt / vitest / libraries / requests"]
  PLUGINS --> CORE
  PLUGINS --> CHILD["Zeltの子プロセス<br/>appを読みJSONを返す"]
  UI["Studio SPA<br/>v1 schemaを読む"] --> SCHEMA["共通JSON schema<br/>TS/Node/Zeltへのruntime依存なし"]
  CORE --> SCHEMA
~~~

| 箱 | 場所 |
| --- | --- |
| config・生成入口 | packages/cli/src/studio/extraction/run.lib.ts（段取り）、run-plugins.lib.ts（plugin実行）、extraction-program.lib.ts（Program生成）、core/extract-config.lib.ts。既存studioコマンドのextract。既存serverは置き換えない |
| コア（TS索引・値追跡） | extraction/core/core-facts.lib.ts（段取り）、core-index.lib.ts（索引・線の登録）、core-declarations.lib.ts（宣言の収集）、core-relations.lib.ts（線の走査）、core-sites.lib.ts（所在と原文の引き口）、test-scope.lib.ts（値の由来追跡） |
| Zelt plugin（ASTを読まない） | plugins/zelt.lib.ts（段取り）、zelt-blueprint.lib.ts（runtimeの記録 → 材料）、zelt-inspect-entry.ts（子プロセス）、zelt-inspect-runner.lib.ts（起動・timeout）、zelt-inspect-protocol.ts（JSONのschema）、zelt-inspect-resolve.lib.ts（appと同じinstanceの解決） |
| Zelt pluginのうち今回作り直さないもの | zelt-eventbus.lib.ts（event）、zelt-lifecycle.lib.ts（`lifecycle.register`）、zelt-test-setup.lib.ts（Unitのsetup）、zelt-context.lib.ts・zelt-runtime.lib.ts（この3つが使うTSの索引と小道具） |
| 他のpluginと組立 | vitest.lib.ts、library.lib.ts（valibot.lib.ts・drizzle.lib.ts が共用）、http-requests.lib.ts、core/assemble.lib.ts（assemble-materials / -groups / -tests に分割） |
| JSON契約 | extraction/core/snapshot-schema.lib.ts。Valibot schemaを正とし、公開型はInferOutputで生成。ブラウザ用exportにTS/Node importを混ぜない |
| Zeltの読取API | [HTTP feature](../../packages/core/src/features/http/http.feature.ts)、[routing metadata](../../packages/core/src/features/http/routing/routing-metadata.lib.ts)、[eventbus feature](../../packages/eventbus/src/eventbus.feature.ts)、[class source](../../packages/decorator-metadata/src/inspect/class-source.lib.ts)。既存の読み取り口だけを使い、coreには何も足さない |

子プロセスはcli.jsに束ねず、`dist/studio/extraction/plugins/zelt-inspect-entry.js` として出してtsxが直接実行する（既存のanalyzer-entryと同じ扱い）。

schemaはCLIの専用subpathからexportし、UIはそこだけimportする。現在の[src/snapshot-schema.lib.ts](src/snapshot-schema.lib.ts)をそこへ移し、coreとUIで二重管理しない。UIへのビルド時依存であり、静的配信時にCLIやNodeは不要。

### L. UIの追従

実装する前提: 前提1（変えるのは[4.5](#45-v1からの変更)への追従と、[4.3](#43-意図と事実を重ねるから)・[4.6](#46-見せ方と運用)の表示だけ）。**すべてmockに反映済み**（2026-09-24）。

| 変更 | mockで変えた場所 | 画面で見えること |
| --- | --- | --- |
| schema | [snapshot-schema.lib.ts](src/snapshot-schema.lib.ts)、[snapshot.types.ts](src/snapshot.types.ts) | なし |
| 適用順（`order`） | [relations.lib.ts](src/relations.lib.ts)（タグに最も早い `order` を持たせる）、[map-presenter.lib.ts](src/map-presenter.lib.ts)（`order` 順に並べ、持たないタグは後ろ） | 「適用:」タグが実際に通る順（Logging → Jwt）で並ぶ |
| 種類と意味の分離 | [labels.ts](src/labels.ts)（`relationKind`・`declarationLabel`: 意味があればそれ、無ければTSの種類）。チップ・middleware判定（[relations.lib.ts](src/relations.lib.ts)・[scope.lib.ts](src/scope.lib.ts)）は付与された線の種類で判定 | 変わらない（線の色・凡例・`SCHEMA`/`TABLE` 表示は今までどおり） |
| setup | [inspector-presenter.lib.ts](src/inspector-presenter.lib.ts)、[inspector.tsx](src/views/inspector.tsx) | 詳細の「契約」に「Setup」欄。種類・provider・式と、地図にある相手へのリンク。groupではメンバーのsetupも並ぶ |
| 列の表示切替（roleの廃止） | [state.lib.ts](src/state.lib.ts)（`hiddenColumns`、既定は `initiallyHidden`）、[layout.lib.ts](src/layout.lib.ts)（隠した列は幅を取らない）、[map-controls.tsx](src/views/map-controls.tsx) | 操作列に「列」のチェックボックス（全列）。旧「config」トグルはこれに置き換え。地図の上に隠した列の案内は出さない。列の見出しは列を隠しても中身の箱と同じ位置に出る（幅が変わって拡大率を合わせ直すとき、表示の左上を固定する: [use-viewport.ts](src/views/use-viewport.ts)） |
| 隠した列との関係 | [relations.lib.ts](src/relations.lib.ts)（`relationPart` が隠した列に端を持つ関係を最初に `hidden` とし、線にもチップにもしない） | 何も出ない（箱・線・チップのどれも）。関係の一覧ダイアログは廃止。隠した列の宣言へ検索で移ると、その列が表示に戻る |
| Composition列 | fixtureの `app.ts` の列、[toolbar.tsx](src/views/toolbar.tsx)（「アプリ構成」ボタンを削除） | app.tsは既定で出ない。Composition列を隠している間、appへの登録は線にもチップにもならない |
| Unitの `setup: null` | [test-presenter.lib.ts](src/test-presenter.lib.ts) | 分類「関数」、mock対象「—」 |
| E2Eの「一部のみ」 | [test-presenter.lib.ts](src/test-presenter.lib.ts) | 「一部のみ · N件（収録範囲: …）」。「未収録」は出ない |
| Unitの収録範囲 | [test-presenter.lib.ts](src/test-presenter.lib.ts) | 「収録範囲: src/**/*.test.ts（12ファイル）」 |

9/23までに反映したもの（`expandedY` 削除とUI計算の並び、`hints`、`entries` と起点ショートカットの削除、`e2eTests` の移動、IDでなく名前の表示、展開classのソース順）は変わらない。

**手書きfixtureで直していたもの**（この文書の規則とconfigで説明できる形にした項目。いまは抽出器が同じ形を出す）:

| 箇所 | 直し方 | 根拠 |
| --- | --- | --- |
| 線・宣言の種類 | TSの種類＋ `meanings`。middleware・event・appへの `register` は付与された線 | [4.5](#45-v1からの変更) |
| `EcJwtConfig.resolveUser` → `@callback:0` の `returns` | 外した（戻り型はホワイトリスト外で線は出ない） | [4.1](#41-責務と流れから) |
| `LifecycleManager` の箱と、そこへのcall 2本 | 外した。`lifecycle.register(this)` はsetupへ | [4.1](#41-責務と流れから)・[4.2](#42-ライブラリは接点だけから) |
| setup | inject 16・middleware 19・config-override 2・lifecycle 2 を付与 | [付録A](#付与の全表) |
| middlewareの適用順 | 付与された線30本に `order` を入れ、app（Logging 0）→ class/method（Jwt・RateLimit 1）に直した。coreがrouterごとに先頭で登録する組込み（Cors・SecureHeaders）は箱も線も出さない | ユーザー判断（2026-09-24）。`order` はappが書いた並びの0始まりの位置 |
| 列 | roleを削除、app.tsをComposition列へ、列名「外部」→「ライブラリ」 | [4.3](#43-意図と事実を重ねるから) |
| E2E | productを送らない11 routeを「一部のみ・0件」に | [4.4](#44-コードと一致するから) |
| Unit | 151 case（延べ211行）を25宣言に | [付録F](#f-unit) |

### M. 完了判定

実装する前提: 0節の完了の定義と前提1（今の手触りが保たれることを回帰検証する）。各行は4節の対応する結果の受入条件。

文書の型検査だけでは下表を達成したことにならない。実装時には実ソースfixtureからJSONを生成し、最後にブラウザで確かめる。

| 照合する場所 | 受入条件 |
| --- | --- |
| graph全体 | ec-backendのinclude範囲のclass/file/interfaceとmemberを列挙。1関数1宣言、callbackの包含、存在するIDへの参照を検証 |
| 注文取得 | findById→DrizzleService.dbのread、ordersへの `table` 線と `table` 宣言、Orderの型参照。架空のRepository/Portなし |
| 注文作成 | transaction/map等のcallbackが別の宣言で内部の依存を所有。折りたたみ時だけclass/fileへ集約 |
| HTTP / middleware | appの各routeと適用middlewareを、共通登録規則の期待値と照合。親子mount・skip・同名controller・同class複数mountも別fixtureで検証。route methodに `<METHOD> <path>` のhint |
| config | EcJwtConfig・EcCorsConfigからライブラリのJwtConfig・CorsConfigへのextends/overrideが残り、setup `config-override` が付く。Config列を隠しても実データは消さない。`src/config/` の原文は `declaration-only` |
| event | OrderHandlersの購読callbackと同じbusのemitを結ぶ。別busの同名eventは結ばない |
| hints | [付録A](#注記の付与規則全表)の表のlabelが該当宣言に付き、pluginを外すとそのproviderのhintだけが消える |
| Unit | アプリのtestのcase本文が直接呼んだ宣言にだけ付く。ライブラリの宣言は未収録のまま。setupのtarget由来とconfig差替えを保持し、通常のimport（joseなど）をoverridesへ入れない |
| E2E | 静的なdirect/helper request（`beforeAll` のapp・テンプレート文字列のURL・局所helperを含む）を、同じappでmethod・pathが一致するrouteを登録したmethodの `e2eTests` へ付ける。範囲がサンプリングなら全routeが「一部のみ」で、一致しないrouteは0件。未対応の経路はpartialとして見える |
| 任意plugin | Zelt無効でもコアの箱・ID・線・種類は同じで、そのpluginの付与だけが無くなる（[付録A](#pluginが無いときの値全表)）。appをimportしない。runner差替えの共通契約を偽pluginで検証 |
| 再現性と失敗 | plugin順を変えてbyte一致。不正ID/別revision/競合/子プロセスの失敗/required不足でpublishせず旧ファイルのhashが変わらない |
| Studio | 生成JSONをfetchし、今の手触り（選択近傍・双方向の独立再帰・lock・折りたたみ・可視tagだけの高さ・Unit/E2E一覧・reload）が保たれることを回帰検証。差分は[4.5](#45-v1からの変更)の変更点（起点ショートカットの削除、詳細パネルのsetupを含む）、列の表示切替（[4.3](#43-意図と事実を重ねるから)）と、[4.6](#46-見せ方と運用)の表示の追従だけ |

実装順は依存する箱に沿って、schema（v1差分）＋UI追従＋fixture移行（済み） → 索引 → plugin＋inspection → 組立/publish → 生成JSONへ切替。各箱の契約テストを先に置く。Vitest以外のrunner、任意JSの実行結果推定、testのin/out値収集、外部plugin配布は初版の完了条件に含めない。

### N. 実装時に決めること

②と前提の範囲内で、実装しながら詰めればよいもの。どれもユーザーの判断は要らない。

| 項目 | 内容 | 関係する②・前提 |
| --- | --- | --- |
| `schemaVersion` | 1のまま据え置くか上げるか。UIとfixtureを同時に更新するので旧形式の互換読みは要らない | 前提1 |
| `event-type` のTSの種類 | fixtureの `signature` は、`order:created` がinterface memberであることからの推定。コアが実際に何の種別を返すかを確かめる | ②4 |
| write / setter / enum | 代入（write）はv1のrelation kindに無い（fixtureは代入を線にも根拠にもしていない）。setter・enumはv1の宣言kindに無い（ec-backendのsrcでは未発生）。readへ畳むか等 | 前提1・②4 |
| 動的なtest名 | `TestIdentity.name` / `suite` はnullを許さない。静的に解けないeachのtemplate等の出し方 | ②4 |

実装より前にAI 判断で決めたもの（旧N）:

| 項目 | 決めたこと | 理由 |
| --- | --- | --- |
| 意味・付与された線・setupのkind | 開いた文字列。表示名はUIの[labels.ts](src/labels.ts)、知らない種類はそのまま出す | 新しいpluginのためにschemaを変えなくてよい（前提2） |
| 1つの対象に異なる意味が並んだとき | 先頭（provider ID順）を表示する | 並び順の規則で一意に決まる（②4）。ec-backendでは起きない |
| `DI / 初期化` の注記 | 残す | 地図の見え方を変えない（前提1）。詳細はsetupが持つ |
| setupを照合できなかったcall | DIを経由しない呼出は `setup: null`（分類「関数」）。由来が解けないcallは `resolution: 'unresolved'` | 無いことと分からないことを分けて見せる（②4） |
| 空の列 | groupの無い列は配信しない | 空の列は何も示さない（②1）。fixtureは「未分類」列を持たない |
| `returns` の型 | v1の型から外した | 出力しないものを型に残さない（②4） |
| E2E範囲がサンプリングであることの書き方 | configのE2E範囲とrunnerの設定のtest対象を比べ、一部なら「一部のみ」 | 人が書き忘れても一部と分かる（②4） |

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

**2026-09-24（生成物への置き換え）**:

- `public/ec-backend.snapshot.json` を `zelt studio extract` の出力に置き換えた。生成コマンドと入力は[README](README.md)・[ec-backend.extract.json](ec-backend.extract.json)。同じ入力で2回生成してbyte一致（`snapshotId` は `d9b21ad71b7c…`、`provenance` は `extracted`）。
- 手書きfixtureとの差は、`CorsConfig.origin`・`CorsConfig.credentials` の `signature` に初期値（`= [];`・`= false;`）が入る2件だけ。group・宣言・線・意味・注記・setup・Unit・E2Eの件数と中身、列と列の割り当てはすべて一致する。
- IDは抽出の形式（[4.6](#46-見せ方と運用)のユーザー判断 9/23）になった。表示は名前で行うので画面は変わらない。mockのtestとgoldenは、IDではなく表示名（group名・`Group#宣言名`）で書くようにした。
- 表示の回帰: 置き換え前のfixtureで120状態すべてが保存済みハッシュを再現することを確かめたうえで、表示名で正規化した投影を突き合わせ、120状態すべてで完全に一致した（差ゼロ）。goldenは表示名で持ち直して再生成した（[README](README.md)の8回目）。
- 検証: `pnpm typecheck`・`pnpm test`（214件）・`pnpm lint`・`pnpm exec biome check`・`pnpm build`・`pnpm test:browser`（39件）が通る。previewを起動してブラウザで初期表示と `CartController` の選択を確認（31箱・列7つ・console error無し）。

**2026-09-24（この計画の形への反映）**:

- schema・fixture・UIを[付録L](#l-uiの追従)のとおり更新した。検証: `pnpm typecheck`・`pnpm test`（214件）・`pnpm lint`・`pnpm build`・`pnpm test:browser`（39件、PC・タブレット・モバイル）がすべて通る。
- fixture: 32 group（ライブラリ9）・127宣言・relation 203本（コアの線163、うち意味付き24。付与された線40: middleware 30・event 1・register 9）。setup 39件（inject 16・middleware 19・config-override 2・lifecycle 2）。宣言の `hints` は46件。coreがrouterごとに先頭で登録する組込みmiddleware（`CorsMiddleware`・`SecureHeadersMiddleware`）は、appが書いていないので地図に出さない（ユーザー判断 2026-09-24）。`CorsConfig` は `EcCorsConfig` が差し替える基底として残る。
- Unit: ec-backendの12ファイル・212 caseを、TS Compiler APIのスクリプトで[付録F](#f-unit)の規則どおりに結んだ。151 caseが25宣言に付く（延べ211行）。setupは `createTestTarget` 12か所で、分類はSolitary・Sociable・関数のすべてが現れる（例: `CartService.addItem` はSolitary（mock: MemoryKVAdaptor, ProductService）とSociable、`requireUser` は関数）。
- E2E: routeを登録した16 methodのすべてが「一部のみ」。productを送らない11は0件。
- 表示の回帰（`src/test-fixtures/legacy-display.json` の120状態）は、変更前後の投影を突き合わせてから再生成した。差は、appに登録された9箱の「Compositionとの関係あり」チップ、`LifecycleManager` と `returns` の線3本の消滅、Config列を隠したときにライブラリのconfig箱が残り列が詰まることだけ（[README](README.md)）。その後、隠した列のチップを廃止したとき（9/24）にもう一度再生成した。差は「<列名>との関係あり」チップの消滅（とその分の高さ・y）だけ。組込みmiddlewareを地図から外したとき（9/24）にも再生成した。差は、その2箱の消滅と `適用: Cors`・`適用: SecureHeaders` タグ（各状態8個）の消滅、それに伴う高さ・yの移動だけで、矢印・x・幅・展開・選択・濃淡は全状態で一致する。

**2026-09-23までの確認**（数は当時のfixtureのもの）:

- v1の型は `src/snapshot-schema.lib.ts` と照合し、[付録A](#a-出力の形)の差分以外は変えていない。
- contractは `CartService` → `KVStore`（interface）の6本だけ。
- callbackの宣言は18個（引数callback 17個と、`EcJwtConfig.resolveUser` が返す関数1個）。関係の所有は、各根拠の式の位置を実コードで引き直し、最内のcallbackと一致することを確かめた（186件）。
- ライブラリの箱: 移行前の外部18 groupから、アプリが使わない6 group、使わないメンバー43個、箱の中から出ていた線38本、ライブラリ自身のUnit test 6 caseを外した。
- routeの注記は、Zeltの `joinPath` と同じく末尾の `/` を付けない（`@Get('/')` は `GET /api/products`）。
- ec-backendのsrcにsetter・enumは無い。parameter propertyは10 class・14件。
- config＋規則との照合（TS Compiler APIで宣言と線を導いてfixtureとdiffするスクリプト）: 列・groupの列・宣言のkind・excerpt・注記は `order:created` 以外で一致。線は238本中236本が一致。
- config＋規則で説明できないfixtureの箇所（直していない）: `order:created` をfile groupに置いた（declaration merge、[付録O](#o-今は扱わないもの)）、emit/onのevent名から `order:created` への `type` 2本（根拠が相手側の宣言位置）、`DrizzleService.db` の `typeof schema`（namespace import）への線が無い。`@Authorized()` の扱いは、2026-09-24にsetup `middleware`（target無し）として解消した。

未検証: 型ブロックと設定例の型検査（配信型の差分ブロックは単独では検査していない）、Mermaidの描画、読みやすさのユーザー評価。受入条件（[付録M](#m-完了判定)）のうち、ec-backendで確かめられる行は生成物で満たしている（上記）。別fixtureが要る行（親子mount・同名controller・偽pluginでのrunner差替え等）は未検証。
