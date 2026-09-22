# Studio抽出設計 — 実コードから、照合できる地図を作る

抽出の設計はこの1ファイルにまとめる。**実装する対象はec-backend全体のgraph生成とStudioへの接続**。この文書の更新では、抽出器やUIはまだ変更しない。

地図はTSの宣言と参照から作り、Zelt・test runnerなどの意味を任意pluginで足す。配置は人がconfigで指定する。架空のUseCase・Portを補って整った図にはしない。

## 1. 全体：どの箱が何を決めるか

以下の矢印はデータの受渡し。アプリ内の依存を描いた図とは区別する。

~~~mermaid
flowchart LR
  S["実コード<br/>TS / tsconfig"] --> T["TS索引<br/>宣言・参照・所在"]
  T --> P["任意plugin<br/>Zelt / Vitest<br/>Valibot / Drizzle"]
  T --> A["組立<br/>ID照合・統合・検証"]
  P --> A
  C["抽出config<br/>対象・plugin・配置"] --> A
  C -.-> T
  C -.-> P
  A --> G["配信JSON<br/>SourceGraph"]
  G --> V["既存Studio<br/>地図 → 契約 / 実コード"]
~~~

| 箱 | 任せること | 任せないこと |
| --- | --- | --- |
| TS索引 | 実在する宣言・call/read/type・包含・source | layerや「業務上の注文処理」の創作 |
| 任意plugin | ライブラリの意味・起点・test登録 | 他pluginの出力の書換え、別IDの宣言の新造 |
| 組立 | 共通IDで情報を結び、所有者の中へ格納 | 未解決を「なし」に変換すること |
| 抽出config | 収録範囲、globによる列・順序、明示した実行環境 | 実コードにない依存線の手入力 |
| Studio | 配置・折りたたみ・選択・lock・詳細表示 | TS解析、Zelt固有の意味の再判定 |

まず[配信する地図](#2-配信する地図)で完成形を見る。その中の箱をどう得るかは[TS索引](#3-ts索引実在する箱と線)、[plugin](#4-plugin意味を加える境界)、[test対応](#5-test関数の一覧とendpointの一覧を分ける)に分ける。生成・UI接続・受入条件は[最後の節](#7-生成からstudioまで)に置く。

本文中のTypeScriptブロックを連結すると、配信型と抽出境界の宣言になる。現行v1型の省略参照は使わない。型は各図の直下で、その箱を実装するときに読む。

## 2. 配信する地図

### 箱の中に、その箱の詳細を置く

~~~mermaid
erDiagram
  direction LR
  SourceGraph ||--o{ SourceGroup : groups
  SourceGroup ||--o{ SourceDeclaration : members
  SourceGraph {
    SourceGroup[] groups "地図本体"
    MapPresentation presentation "列と配置ルールの識別"
    AnalysisReport[] analyses "取得範囲と不足"
  }
  SourceGroup {
    string id "実在するclass・file・interface"
    string name "実ソースの名前"
    SourceDeclaration[] members "1関数1node"
    SourceRelation[] relations "継承などgroup自身の関係"
    Semantic[] semantics "config等の意味"
    SourceDetail source "所在と契約"
    GroupPresentation presentation "列・順序・表示role"
  }
  SourceDeclaration {
    string id "宣言の共通ID"
    string kind "TS上の宣言種別"
    string enclosingDeclarationId "入れ子関数の親。なければnull"
    SourceRelation[] relations "この宣言が使う先"
    Semantic[] semantics "schema・table等"
    SourceDetail source "所在・契約・原文"
    UnitTests unitTests "直接テストするcase一覧"
    EntryPoint[] entries "HTTP等の入口"
  }
~~~

**折りたたみは表示上の集約**。methodの関係をclassにも二重保存しない。schema/tableはTSでは変数宣言であり、その意味だけをpluginが加える。interfaceは実際に存在するものを収録するが、interfaceのないコードへPortは足さない。

~~~ts
import type * as ts from 'typescript';

type Id = string;
type ProviderId = string;
interface StudioSnapshot {
  schemaVersion: 2;
  snapshotId: string;
  sourceRevision: string;
  project: { id: string; name: string };
  provenance: 'extracted' | 'manual-fixture';
  graph: SourceGraph;
}
interface SourceGraph {
  groups: SourceGroup[];
  presentation: MapPresentation;
  analyses: AnalysisReport[];
}
interface Subject {
  id: Id;
  name: string;
  relations: SourceRelation[];
  semantics: Semantic[];
  source: SourceDetail;
  unresolved: Diagnostic[];
}
interface SourceGroup extends Subject {
  kind: 'class' | 'file' | 'interface';
  filePath: string;
  expansion: 'included' | 'boundary';
  members: SourceDeclaration[];
  presentation: GroupPresentation;
}
interface SourceDeclaration extends Subject {
  kind: 'constructor' | 'method' | 'getter' | 'setter' | 'property'
    | 'function' | 'callback' | 'signature' | 'type' | 'value' | 'enum';
  enclosingDeclarationId: Id | null;
  unitTests: UnitTests;
  entries: EntryPoint[];
  presentation: { hint: string | null };
}
~~~

### 線とsource：何を根拠に結んだか

~~~mermaid
erDiagram
  direction LR
  SourceRelation ||--|{ Evidence : evidence
  SourceDetail ||--o{ SourceLocation : locations
  SourceRelation {
    string to "相手のgroupまたは宣言ID"
    string kind "call / read / type / implements等"
    string applicationId "app固有の線のみ。通常null"
    Evidence[] evidence "実ソース位置と取得元"
  }
  Evidence {
    string provider "ts / zelt / vitest等"
    SourceLocation location "証拠の所在"
    string basis "syntax / metadata / configured"
  }
  SourceDetail {
    SourceLocation[] locations "overload・宣言mergeも保持"
    string[] signatures "宣言の契約"
    SourceExcerpt excerpt "許可した原文だけ"
  }
~~~

~~~ts
interface SourceLocation {
  filePath: string;
  start: number; end: number;
  startLine: number; endLine: number;
}
interface Evidence {
  provider: ProviderId;
  location: SourceLocation;
  basis: 'syntax' | 'metadata' | 'configured';
}
type RelationKind = 'call' | 'read' | 'write' | 'type' | 'construct'
  | 'extends' | 'implements' | 'override' | 'returns'
  | 'contract' | 'middleware' | 'event' | 'register';
interface SourceRelation {
  id: Id;
  to: Id;
  kind: RelationKind;
  applicationId: Id | null;
  evidence: Evidence[];
}
interface Semantic {
  kind: 'service' | 'config' | 'schema' | 'table' | 'event-type';
  evidence: Evidence[];
}
interface SourceDetail {
  locations: SourceLocation[];
  signatures: string[];
  excerpt: { kind: 'code'; text: string } | { kind: 'declaration-only' };
}
interface Diagnostic {
  code: string;
  message: string;
  subject: Id | null;
  locations: SourceLocation[];
}
~~~

| 項目 | 契約 |
| --- | --- |
| 所在 | project rootからのPOSIX相対パス。offsetはUTF-16・0-based・半開区間。行は1-based。TSのgetStart/getEndを使用 |
| signatures | 修飾子・generic・optional・default・型alias・overloadを維持。関数本体は除く。変数の型が省略されたときだけcheckerの型表示を補う |
| 原文 | sourceTextに合致するファイルだけcode。未許可はdeclaration-only。signature内の初期化値も未許可時は除去する。秘密値を自動検出できるとはしない |
| 根拠 | metadata由来でも、decoratorまたは登録式の実位置が必要。位置が取れなければ診断し、その事実を追加しない |
| 境界 | 参照先の宣言を同じProgramで解決できればboundaryの箱を作る。型定義も所在として有効。解けない相手には偽nodeを作らない |
| relationの同一性 | 所有者・to・kind・applicationIdで集約。evidenceの異なるcallは同じ線の使用箇所として残す。schema/tableのreadを別の線として複製しない |

### 起点とtest：nodeへ何を添えるか

~~~mermaid
erDiagram
  direction LR
  SourceDeclaration ||--|| UnitTests : unitTests
  SourceDeclaration ||--o{ EntryPoint : entries
  EntryPoint ||--o| EndpointTests : "HTTPのみ"
  UnitTests {
    UnitTestCase[] cases "この宣言を直接呼ぶUnit"
    Coverage coverage "空と未収集を区別"
  }
  EntryPoint {
    string id "appと登録を含めたID"
    string applicationId "どのappか"
    EntryRoute route "HTTP / event / middleware / lifecycle"
    Evidence[] evidence "登録の根拠"
  }
  EndpointTests {
    EndpointTestCase[] cases "このHTTP入口へのE2E"
    Coverage coverage "helper等の未対応も明示"
  }
~~~

~~~ts
type EntryRoute =
  | { kind: 'http'; method: string; path: string; e2eTests: EndpointTests }
  | { kind: 'event'; eventName: string; bus: Id }
  | { kind: 'middleware' }
  | { kind: 'lifecycle'; hook: 'startup' | 'shutdown' };
interface EntryPoint {
  id: Id;
  applicationId: Id;
  route: EntryRoute;
  evidence: Evidence[];
}
interface TestIdentity {
  id: Id; runner: ProviderId;
  name: string | null; suite: (string | null)[];
  mode: 'normal' | 'skip' | 'only' | 'todo';
  registration: SourceLocation;
  caseKey: string;
}
interface UnitTestCase extends TestIdentity {
  calls: { invocation: SourceLocation; setup: SetupAnalysis; evidence: Evidence[] }[];
}
interface UnitTests { cases: UnitTestCase[]; coverage: Coverage }
interface EndpointTestCase extends TestIdentity {
  requests: { invocation: SourceLocation; via: 'direct' | 'helper' }[];
}
interface EndpointTests {
  cases: EndpointTestCase[];
  coverage: Coverage;
  includesSharedSetup: boolean;
}
type SetupAnalysis =
  | { kind: 'uncollected' }
  | { kind: 'unresolved'; reason: string }
  | { kind: 'zelt'; detail: UnitSetup };
interface UnitSetup {
  id: Id; targetClass: Id; location: SourceLocation;
  dependencies: { provide: Id; kind: 'service' | 'config' }[];
  configs: Id[];
  overrides: { provide: Id; kind: 'service' | 'config' }[];
}
~~~

CLIやschedulerも概念上はentry。ただし初期pluginには検出器がないため、初版のunionには入れない。対応追加時にschemaを改訂し、関数名から入口だと推測しない。

### 「ない」と「まだ分からない」を分ける

~~~ts
type Feature = 'declarations' | 'relations' | 'semantics' | 'entries'
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
interface Coverage {
  status: 'uncollected' | 'complete-in-scope' | 'partial';
  reportIds: Id[];
}
~~~

complete-in-scopeは、**configで選んだ範囲内**を列挙できたという意味。未対応syntax・不明なtarget・動的なtest登録があればpartial。casesが空でもuncollectedなら「testなし」と表示しない。局所のunresolvedにはsubjectに対応する診断を置き、全体の未取得はanalysesを見る。

scope.filesはglob展開後の正準path一覧、inspectedFilesは実際に読んだ一覧。report IDはprovider・feature・category・scope.filesから作る。tsはsource、runnerは指定test scope、Zeltはsourceと指定Unit scopeを担当し、各担当feature/scopeについて必ずreportを返す。設定されていない組合せはhostがdisabledとして記録する。

例外・不正ID・metadata worker失敗はpartialではなく生成失敗。失敗した新JSONは配信しない。

## 3. TS索引：実在する箱と線

### 宣言・参照・値の由来は、別の情報

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

~~~ts
interface IndexedCall {
  id: Id; location: SourceLocation; owner: Id | null;
  target: Id | null;
  receiver: SourceLocation | null;
}
interface SourceIndex {
  revision: string;
  program: ts.Program;
  checker: ts.TypeChecker;
  groups: readonly SourceGroup[];
  reports: readonly AnalysisReport[];
  files: readonly ts.SourceFile[];
  declarations: readonly Id[];
  calls: readonly IndexedCall[];
  declaration(id: Id): ts.Node | undefined;
  declarationId(node: ts.Node): Id | null;
  call(id: Id): IndexedCall | undefined;
  node(location: SourceLocation): ts.Node | null;
  location(node: ts.Node): SourceLocation;
  directCalls(owner: Id): readonly IndexedCall[];
  resolveExport(ref: ExportReference): Id | null;
}
interface ExportReference { filePath: string; exportName: string }
~~~

groupsはTSの基本graph。semantics/entries/casesは空、coverageはuncollected。testファイルも索引には入るが、通常の地図へは出さない。test setupが参照するtest専用classなどは必要な宣言だけboundaryとして組立時に出す。存在するIDへの参照を、所在のない名前へ落とさない。

pluginは索引・ASTを変更しない。未知IDはundefined、解けないsymbolはnull。別Programのnodeをlocationへ渡すのは契約違反。node(location)は範囲完全一致の最深node、directCallsは入れ子関数へ降りず、引数内のcallは含む。

property/トップレベル変数のinitializerはその宣言が参照を所有する。それ以外のトップレベル実行文はfile groupが所有する。関数内では最内の関数が所有し、ローカル変数のためだけにnodeを増やさない。

### 箱の切り方とID

| ソースの形 | group / node |
| --- | --- |
| class / interface | 宣言ごとのgroup。method・constructor・accessor・property・signatureがmember |
| トップレベル関数 / 変数 / type / enum | 同じモジュールのfile groupにmember。変数に直接束縛されたarrow/functionはfunction node一つで、valueと二重化しない |
| 関数引数のcallback / 入れ子関数 | 独立node。enclosingDeclarationIdに最内の関数を設定。内部の依存はそのnodeが所有 |
| constructorのparameter property | property nodeを作る。通常の引数・ローカル変数は値追跡のbindingでありnodeにしない |
| overload / declaration merge | 同じSymbol・同じmember種別は1node。signatures/locationsに各宣言を保持し、callは実装へ正規化 |
| get/set / static/instance | 別node。readはgetter、writeはsetter。class自身へのextends/implementsはgroupが所有 |
| namespace / 入れ子class | 実際の宣言を収録し、修飾名をIDへ含める。実装都合の新しい業務groupは作らない |

IDは `prefix + JSON.stringify(parts)`。groupは`["class|file|interface", path, qualifiedName]`、宣言は`[groupId, enclosingId, kind, staticOrInstance, name]`。無名callbackのnameは親内の構文順序による`@callback:0`等で、表示でも生成名と分かるようにする。同名無名宣言は構文順のordinalを追加する。

callは`["call", path, start, end]`。relationは`[owner,to,kind,applicationId]`。entryは`[provider,applicationId,registrationKey,subject,routeWithoutTests]`。testは`[provider,registrationCallId,caseKey]`。すべて同じsourceRevision内で照合する。名前付き宣言は前方への行追加でIDが変わらない。rename・匿名callbackの挿入順変更には永続性を保証しない。

### 線の取得規則

| 線 | 機械的な取得方法と限界 |
| --- | --- |
| call / construct | getResolvedSignatureの宣言、alias解決後のSymbolへ。unionなどで実装候補が複数なら未解決。runtimeのoverride dispatchまでは保証しない |
| read / write | property・getter・変数のSymbol。callee自身をreadとして二重化しないが、中間receiverのpropertyは読む。代入左辺はwrite、複合代入はread＋write |
| type / returns | 型構文のSymbolを辿る。明示の戻り型はreturns、その他はtype。型文字列を再parseしない。推論された複合型の内部依存までは収集しない |
| extends / implements / override | heritage句と基底memberのSymbolから。基底classの場所を「Port」へ移動しない |
| callbackへの関係 | 外側が渡すcallbackにreadを張る。callは実行を静的に確認できた場合のみ。callback内の線を外側にも転記しない |
| 動的property / 関数を保持した変数 | 定数property名・不変aliasまでは解決。可変bindingや複数候補は診断。型が同じという理由で一つの関数へ決めない |
| 外部ライブラリ | 参照先が取れればboundary。外部実装の内部を再帰展開しない。外部だと分かった未解決と、app内の未解決は診断コードを分ける |

実際の[OrderService.findById](../../integration/ec-backend/src/usecase/order.service.ts)では、`this.drizzle.db`からDrizzleService.dbへのreadが残る。`select()`が外部APIでもこの線を省かない。`orders`はtable意味を持つread先。OrderRepositoryの箱は作らない。

## 4. plugin：意味を加える境界

### すべて同じ索引を読み、事実を返す

~~~mermaid
flowchart LR
  I["SourceIndex<br/>共通ID・call・source"] --> Z["Zelt<br/>意味 / DI / 起点 / setup"]
  I --> T["Runner<br/>test / suite / hook"]
  I --> L["Library<br/>schema / table / request"]
  Z --> F["PluginResult<br/>facts + reports<br/>sourceRevision"]
  T --> F
  L --> F
  F --> A["組立<br/>所有者へ格納<br/>receiverとsetupを照合"]
~~~

plugin間の呼出はしない。VitestはZeltのtargetを知らず、ZeltはitやbeforeEachを知らない。Jest/Mocha追加時もrunnerの箱だけ差し替える。初期実装はVitestと下記ライブラリpluginを同梱し、外部pluginの動的インストール・公開SDK化は対象外。

~~~ts
type Fact =
  | { kind: 'semantic'; subject: Id; value: Semantic }
  | { kind: 'relation'; from: Id; value: Omit<SourceRelation, 'id'> }
  | { kind: 'entry'; subject: Id; registrationKey: string; value: Omit<EntryPoint, 'id'> }
  | { kind: 'test'; value: TestContribution }
  | { kind: 'setup'; value: SetupContribution }
  | { kind: 'application'; value: ApplicationContribution }
  | { kind: 'request'; value: RequestContribution };
interface PluginInput {
  source: SourceIndex;
  scopes: readonly AnalysisScope[];
}
interface PluginResult {
  sourceRevision: string;
  facts: Fact[];
  reports: AnalysisReport[];
}
interface ExtractionPlugin {
  id: ProviderId;
  features: readonly Feature[];
  analyze(input: PluginInput): Promise<PluginResult>;
}
~~~

Factのkindとfeatureは、semantic→semantics、relation→relations、entry→entries、test→tests、setup→test-setups、application/request→requests。hostがplugin.idとreport/evidence.providerの一致を検証する。索引にないID、別revision、宣言していないfeature、report欠落、scope外の読み取りは契約違反。schema/tableは意味の追加だけで既存readを置き換えない。

### Zelt：metadataとTSを繋ぐ場所

~~~mermaid
flowchart LR
  W["隔離worker<br/>指定app・照合対象module<br/>metadata・登録を読む"] --> R["RuntimeReference<br/>module export / 宣言位置<br/>ctor名一致は使わない"]
  R --> B["TSとの照合<br/>同じsource mapping<br/>Symbol → 共通ID"]
  B --> F["Zelt facts<br/>HTTP / middleware / DI<br/>config / event / lifecycle"]
~~~

[既存getClassSource](../../packages/decorator-metadata/src/inspect/class-source.lib.ts)は、constructor identityからmodule/exportを取得できる。一方、[現在のHTTP metadata](../../packages/core/src/features/http/http.types.ts)はcontroller名中心、globalMiddlewaresは適用範囲を平坦化する。**既存APIだけでは不足するので、以下のinspectionを実装に含める。** 名前・配列順で帳尻を合わせない。

~~~ts
type RuntimeReference =
  | { kind: 'export'; module: ExportReference; member: string | null;
      memberKind: 'class' | 'method' | 'getter' | 'setter' | 'property';
      static: boolean }
  | { kind: 'declaration'; location: SourceLocation };
interface RuntimeHttpRoute {
  registrationKey: string;
  controller: RuntimeReference;
  methodName: string;
  method: string; path: string;
  location: SourceLocation;
  middleware: { target: RuntimeReference; location: SourceLocation }[];
}
interface RuntimeInspection {
  applicationId: Id;
  diagnostics: Diagnostic[];
  classes: { target: RuntimeReference; role: 'service' | 'config'; location: SourceLocation }[];
  routes: RuntimeHttpRoute[];
  eventBuses: { registrationKey: string; adaptor: RuntimeReference;
    handlers: RuntimeReference[]; location: SourceLocation }[];
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

| 境界 | 実装する規則 |
| --- | --- |
| workerの起動 | tsxで専用processを起動。指定exportの引数なしfactoryを1回呼ぶ。subjectsは索引で確認したclassのexportであり、moduleをimportしてmetadataを読むだけ。createRuntime/realize・サービス生成・getter評価・test実行は禁止 |
| runtimeとsource | sourceModulesをTS hostのmodule解決と、node:module.registerで登録するworkerのresolve hookに共通適用。指定specifierは同じsource URL、未指定は通常解決。native module cacheを共有し、同一packageのdistとsrcが混在したら失敗 |
| 読取対象のclass | featureの登録class/configに、索引から得たexport済みの収録class・参照先classを加える。subjectsへtest moduleは渡さない。test専用config等は静的な継承・定義元Symbolで対応し、不明ならsetupをunresolvedにする |
| classの同定 | exportはchecker.getExportsOfModule＋alias解決。exportされないclassはdecorator traceの宣言位置へ照合。traceを出す読取APIを追加する。両方不可ならpartial、名前一致で代用しない |
| HTTP inspection | http blueprintにgetInspectionを追加。controller constructor identity、mountごとのfullPath、method、適用middlewareを保持。workerが上のRuntimeReferenceへ変換する |
| middleware | routingが使う登録・skip判定の共通処理をinspectionでも使用。組込みCors/SecureHeaders、親子mount、class/method decoratorを含める。middlewareの実行条件ではなく登録の適用関係を示す |
| 適用先 | routeのcontroller method → middleware実行methodへmiddleware relation。実行methodを登録の型・Symbolから特定できなければpartial。middleware自身にmiddleware entryを付ける |
| DI/config | metadataのInjectable/Configの意味＋Symbolで識別したinject呼出。constructor default/property initializerを読む。constructor省略時は基底を辿る。動的provider・解けないsuper引数はpartial |
| DIの線 | 注入宣言の所有者→provider groupへcontract。methodからprovider memberへのcall/readはTSのまま。Configの継承と差替えを保持し、値は取得しない |
| event | eventbus blueprintにもgetInspectionを追加しadaptor/handlersのidentityを公開。emit/onのSymbolと注入先busを照合。同じapplicationId＋一意に解決した登録provider＋静的event名でのみemit owner→購読callbackを結ぶ |
| lifecycle | LifecycleManager.registerのSymbolとreceiverが解決し、Lifecycle契約のmethodが存在するときだけentryを付ける。startupという名前だけでは入口にしない |

event entryのbusはadaptorのgroup ID。同じappで同じproviderに複数のbus登録があり、注入先を一意に決められなければpartialにする。busを表す架空の宣言nodeは作らない。

getInspectionは**新設するAPI**であって現在存在するという意味ではない。core内ではctorを保持する型、worker出口ではRuntimeInspectionというJSON型にする。登録位置はfeature生成時のtraceとdecorator位置から取得し、TS宣言位置へ正規化する。組込み登録はその定義位置を根拠にする。

workerはOSのsandboxではなく、moduleのトップレベル副作用は起こりうる。Zelt無効時はworkerもapp importも行わない。IPCに結果、stdout/stderrにログを分離し、timeout・import失敗・壊れた応答は生成失敗。DBやネットワークへ接続しないapp factoryを入力条件とする。

### Library：値の名前ではなく定義元を見る

| plugin | 判定と出力 |
| --- | --- |
| Valibot | initializerのcalleeをimport alias越しにvalibot exportへ解決し、戻り型が同packageのBaseSchema/BaseSchemaAsyncへ由来する場合にschema意味。suffixでは判定しない |
| Drizzle | drizzle-ormのtable builder Symbolと戻り型のTable由来を確認してtable意味。tableを読む線はTSのread |
| Zelt event型 | 解決済みeventbus APIの型引数・EventBusSchema拡張の宣言へevent-type意味。event文字列と同名のtypeを探して結ばない |
| HTTP request | 解決済みclient call、またはconfigのhelper契約からapp/method/pathを読む。E2Eへの対応は次節の組立が行う |

ライブラリversionでSymbolの定義元が変わり判別不能ならpartial。外見が似た呼出を成功扱いしない。

## 5. test：関数の一覧とendpointの一覧を分ける

### Unitは「何を直接呼んだか」、setupは別に結ぶ

~~~mermaid
flowchart LR
  R["Runnerの事実<br/>登録・本文・適用hook"] --> U["Unit対応<br/>case本文の直接call<br/>→ 呼出先宣言"]
  Z["Zeltの事実<br/>factory call + target経路<br/>→ DI / override"] --> S["setup照合<br/>receiverの由来が<br/>factory + 経路と一致"]
  U --> S
  S --> V["宣言のunitTests<br/>test名 / 分類 / mock一覧"]
~~~

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
  mode: TestIdentity['mode'];
  context: SetupContext;
  evidence: Evidence[];
}
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
  value: SourceLocation;
}): ValueOrigin;
~~~

| 箱 | 初版で扱う構文・規則 |
| --- | --- |
| Vitest登録 | import元・aliasを解決したdescribe/it/test/hook。globalsはconfigで明示した場合のみ。suiteの入れ子・skip/only/todo・concurrentを保持 |
| parameterized case | 静的な配列literalのeachはcaseKeyをindexにして展開。動的なtableはtemplate一件・名前null・partial。引数に依存するsetup値の代入は初版では未解決 |
| hook文脈 | configのserial/stackならbeforeEachを外suite→内suite、同suiteは登録順。concurrent・parallel・未知modifierは文脈未解決。beforeAll由来の共有値は初版の由来追跡対象外 |
| Unit対象 | case本文のdirectCallsで、収録したapp宣言への直接呼出を一覧化。同じcaseの同じtargetは一行、callsへ集約。helperの先・hook内・未実行callbackはテスト対象に伝播させない |
| receiver由来 | binding Symbolを使い、await/括弧/type assertion、変数代入、不変alias、静的property経路を追う。caseごとに外部bindingをunknownへ戻し、beforeEachから開始 |
| 未対応の由来 | 分岐・loop・動的property・分割代入・helperを経た代入は未解決。alias書換え、closure共有、非await非同期処理、opaque関数へのescapeが関係すればshared-state |
| setup照合 | factoryCall＋resultPathが一致し、呼出先の所属classとも矛盾しなければ付与。型が同じだけの別instanceへは付けない。一致しなくても直接callのtest行は残す |
| Zelt factory | import SymbolでcreateTestTargetを特定。第一引数のclass、optionsのconfigs/overrides、返却値のtarget経路を読む。testを実行しない |
| Zelt詳細 | targetの直接DI、明示configs、setupFilesのconfigureTestDefaultsを読む。定数array/object/alias/spreadまで。動的値・解けない継承・global defaultsの読取漏れがあればanalysisはunresolved |

setup機能が無効ならuncollected。factoryに対応できてもDI等が不明ならunresolved。**未取得のdependenciesを空にしてSolitaryとは判定しない。**

Solitaryは直接注入serviceが0件、または全serviceがoverride済みの場合。残るserviceがあればSociable。config差替えとjose等の通常importはこの分類に含めない。mock一覧はserviceのoverride対象class一覧であり、useValueの中身は配信しない。

[JwtServiceのtest](../../packages/auth-jwt/src/jwt.service.test.ts)は、beforeEachのcreateTestTarget → testTarget.target → jwtService → case内のsignという由来を照合する。JwtConfig→TestJwtConfigはconfig差替えであってmockではない。CreateProductSchemaが内部から呼ばれるだけなら、そのschemaへUnit対象を伝播しない。

### E2EはHTTP entryへ付ける

~~~mermaid
flowchart LR
  C["RunnerのE2E case<br/>本文のcall"] --> M["request照合<br/>同じapp + method + path"]
  Q["Request / Applicationの事実<br/>app式 + factoryの戻り値<br/>method / path"] --> M
  H["Zelt HTTP entry<br/>app + method + route"] --> M
  M --> E["entry.e2eTests<br/>test行 + request所在"]
~~~

~~~ts
interface RequestContribution {
  invocation: Id;
  application: SourceLocation;
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

request pluginはrunnerを参照せず、request呼出候補と、設定で識別したapp factoryの戻り値の対応を別々に返す。applicationはdirect requestならapp.http.requestのapp式、helperなら指定されたapp引数の所在。組立がE2E caseのdirectCallsとinvocationを照合し、そのcaseのhook文脈でtraceOriginを呼ぶ。factoryCall＋resultPathがApplicationContributionと一致したときだけapplicationIdを確定する。class名・URL・ファイル内の代入の存在だけでは結ばない。

traceOriginのvalueはinvocationのreceiverまたは引数内の式。Unitはreceiverを渡す。同一caseと適用hook内の評価順を使い、invocation後の代入は参照しない。別revision・case外のinvocation・そのcallと無関係なvalueは入力契約違反。

初版はapp.http.requestとconfigで宣言したhelperを扱う。ec-backendでは[authRequest](../../integration/ec-backend/e2e/helpers/test-setup.ts)のapp引数0・method引数2・path引数3を指定できる。registerUser/loginUserは固定のPOST/pathを指定できる。これはconfig由来の契約としてevidenceに残し、自動推論した事実と区別する。

method/pathはliteral・不変の定数alias・静的に連結できる文字列まで。direct requestは文字列URLとobject literalのinitを対象にし、method省略はGET、Request objectや可変initは未対応。URLのquery/hashを除き、pathを同一appのrouteへ照合する。初版のroute文法は固定segmentと必須の:parameter。複数候補、wildcard/regex、動的URLはpartialとして未対応にする。曖昧な場合に先頭のrouteへ付けない。

共有hook・helper内部の全requestを再帰実行した扱いにはしない。初版ではincludesSharedSetup=false。suite内に関連する未対応のrequest経路がある場合はE2E coverageをpartialにする。Unit一覧にE2Eを混ぜない。

## 6. config：取得範囲と、表示上の切り方

### 列はconfig、位置の高さはUI

~~~mermaid
flowchart LR
  F["実ソースのfilePath"] --> R["順序付きglob rules<br/>最初に合うルール"]
  R --> P["GroupPresentation<br/>columnId / order / role"]
  P --> U["UIのlayout<br/>表示中のnode高さ<br/>+ 表示中のtag高さ"]
  C["columns<br/>id / label / width"] --> U
~~~

抽出器はexpandedYやtag用の空白を出力しない。configは並び順までを決め、高さはUIが現在の折りたたみ状態・可視tagから計算する。同じ入力と状態では同じ位置になり、選択による薄表示だけでは並べ替えない。

~~~ts
interface MapPresentation {
  id: string;
  columns: { id: string; label: string; width: number }[];
}
interface GroupPresentation {
  columnId: string;
  order: number;
  role: 'regular' | 'config' | 'composition';
  hint: string | null;
}
interface PresentationRule {
  files: string[];
  columnId: string;
  role: GroupPresentation['role'];
}
interface PresentationConfig {
  id: string;
  columns: MapPresentation['columns'];
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
~~~

同一column内はrule index → 正準filePath → 宣言のソース順。orderはこの順の0-based連番。globはpicomatchのPOSIX・case-sensitive・dot=true、否定はexcludeだけで扱う。fallbackColumnIdを必須にし、未分類を勝手にUse caseへ置かない。

configのrootはconfigファイルから解決する。他のpath/globはroot基準。重複column ID・存在しないcolumn・重複plugin ID・project外へのoutputはエラー。sourceModulesは完全一致のpackage specifierをkeyにする。subpathは別keyで指定する。

### pluginの設定も型で閉じる

~~~ts
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

設定にないpluginはdisabled。ZeltのsetupDetails=falseはtest-setupsをuncollectedとし、factory/targetの対応だけは返してよい。Vitestの実行設定は自動でserialにせず、利用中のrunner設定を明示する。setupFilesはrunner側の設定と一致させ、未指定のglobal defaultを不存在扱いしない。

ec-backendの設定例。**例のJSONも上のExtractConfigに適合する**。rootをrepository rootとし、srcと参照先のpackage sourceを同じProgramで解決する。外部公開時はsourceTextを空にする。

~~~json
{
  "version": 1,
  "project": { "id": "ec-backend", "name": "EC Backend" },
  "root": ".",
  "tsconfig": "integration/ec-backend/tsconfig.json",
  "include": ["integration/ec-backend/src/**/*.ts"],
  "exclude": ["**/dist/**", "**/node_modules/**"],
  "sourceText": ["integration/ec-backend/src/**/*.ts"],
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
    { "provider": "zelt", "feature": "entries" }
  ],
  "output": "mocks/studio-spatial/public/ec-backend.snapshot.json"
}
~~~

この例のUnit範囲はJwtServiceのあるpackage、E2Eはec-backend。未指定packageのtestまで「なし」と主張しない。現行のauth-jwtとec-backendのVitest設定にはsetupFiles指定がないため、この例は空配列とする。requiredはcomplete-in-scopeを要求する機能。他の機能のpartialは診断付きで配信可能だが、未取得をUIに表示する。外部serviceを地図の内部として展開したい場合はincludeへそのsourceを追加する。

## 7. 生成からStudioまで

### 組立は「情報を足す」だけでなく、矛盾を止める

~~~mermaid
flowchart LR
  I["SourceIndex<br/>宣言・基本関係"] --> A["assemble<br/>ID検証・事実の統合<br/>Unit/E2Eの対応"]
  P["PluginResult[]<br/>同じrevision"] --> A
  A --> J["StudioSnapshot v2<br/>JSON schema検証<br/>全参照IDの検証"]
  J --> O["publish<br/>一時ファイル → rename<br/>失敗時は旧JSONを維持"]
~~~

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

| 入力・状態 | 組立／実行側の契約 |
| --- | --- |
| 同じ事実 | relationは所有者＋to＋kind＋app、semanticはsubject＋kind、entryは登録ID、testはrunner＋登録＋caseKeyで併合。証拠は位置＋provider＋basisで重複排除 |
| 矛盾する事実 | 同じ登録を複数runnerが主張、同じsetup経路に異なるtarget、同じentry IDに異なるroute、同じclassをserviceとconfigの両方に分類した場合等は生成失敗。先勝ちにしない |
| 不明な事実 | partial＋診断。配信するrelationは必ず実在IDを参照。不明な相手への線は診断だけを残す |
| coverage | scopeごとにrunner＋対応付けのreportを合成。どちらかpartialならpartial、機能が無効ならuncollected。setupの未解決はcall対応を消さずsetup欄に残す |
| 機能の要求 | requiredの全reportがcomplete-in-scopeでなければpublishしない。設定にあるが未実装のplugin/featureはエラー |
| 入力の変更 | 読んだ全ソース・設定・metadata workerの入力を再hash。解析中に変わっていれば生成失敗、異なる版を混ぜない |
| 例外 | config/TS構文・解決の致命的エラー、plugin例外、worker timeout、invalid JSON、IO失敗は失敗として返す。空配列へのfallbackはしない |

提案する実行コマンドは `zelt studio extract --config <config.json>`。成功はexit 0、生成失敗はexit 1。同じ出力先への同時生成は排他lockで拒否し、同じディレクトリの一時ファイルへ書いてschema再検証後にatomic renameする。失敗時は自分が作った一時ファイルだけ回収する。

解析用Programは指定tsconfigのmodule解決・target等を継承し、noEmit=true、rootDir/outDir/composite/incrementalの出力制約を外す。rootNamesはincludeの対象とtest/setup/helperの対象を合わせる。対象ファイルが0件、構文エラー、module未解決は生成失敗。意味解析の診断はanalysesへ残し、影響範囲の関係をpartialにする。

sourceRevisionは、読み込んだソース・参照d.ts・package解決情報・tsconfigとextends・lockfile・抽出configを、正準path順の長さ付きUTF-8列としてSHA-256。plugin version/抽出器versionも含める。snapshotIdはsnapshotId自身を除く全JSONをkey辞書順・配列の規定順で正規化してSHA-256。日時や絶対pathをhashに混ぜない。

出力順はgroupがcolumn/order、memberがソース順、relation/entryはID順、testは登録位置/caseKey順、callsと根拠は位置順。plugin実行順を入れ替えても同じJSONにする。

### 作るコードの置き場所

ここに挙げるのは**次の実装時の変更予定**。今回新しいコードファイルは作らない。初版はCLI内に独立モジュールとして置き、package公開やplugin配布機構は増やさない。

~~~mermaid
flowchart TB
  CLI["CLI: studio extract<br/>config読取・publish"] --> CORE["extraction/core<br/>schema / index / assemble<br/>TSの知識。Zelt importなし"]
  CLI --> PLUGINS["extraction/plugins<br/>zelt / vitest / libraries / requests"]
  PLUGINS --> CORE
  PLUGINS --> BRIDGE["Zelt worker + inspection<br/>core・eventbus・metadataを読む"]
  UI["Studio SPA<br/>v2 schemaを読む"] --> SCHEMA["共通JSON schema<br/>TS/Node/Zeltへのruntime依存なし"]
  CORE --> SCHEMA
~~~

| 箱 | 変更予定の場所 |
| --- | --- |
| config・生成入口 | packages/cli/src/studio/extraction/run.ts、config.ts。既存studioコマンドにextractを追加。既存serverは置き換えない |
| TS索引・値追跡 | 同ディレクトリのindex.ts、origin.ts。metadataの既存解決処理は再利用可能な箇所だけ移植／共通化し、公開inspect APIは維持 |
| pluginと組立 | plugins/zelt.ts、vitest.ts、libraries.ts、requests.ts、assemble.ts。Zeltのruntime importはworker.ts内だけ |
| JSON契約 | 同ディレクトリのschema.ts。Valibot schemaを正とし、公開型はInferOutputで生成。ブラウザ用exportにTS/Node importを混ぜない |
| Zeltの読取API | [HTTP feature](../../packages/core/src/features/http/http.feature.ts)、[routing metadata](../../packages/core/src/features/http/routing/routing-metadata.lib.ts)、[eventbus feature](../../packages/eventbus/src/eventbus.feature.ts)、[class source](../../packages/decorator-metadata/src/inspect/class-source.lib.ts)。登録規則をruntimeと共有する |
| 既存UI | [schema](src/snapshot-schema.lib.ts)、[graph](src/graph.lib.ts)、[layout](src/layout.lib.ts)、[test presenter](src/test-presenter.lib.ts)、[runtime](src/runtime.lib.ts)。共通schemaのbrowser-safe exportを読む。Passive View/Mediatorの構成は維持 |

schemaはCLIの専用subpathからexportし、UIはそこだけimportする。coreのschemaとUIのコピーを二重管理しない。UIへのビルド時依存であり、静的配信時にCLIやNodeは不要。

### fetch後のUI：変える場所、維持する場所

| v1 → v2の差分 | UIへの接続 |
| --- | --- |
| schema/table/event-typeがkindからsemanticsへ | nodeラベル・種類filterで意味を参照。TS kindは別に保持 |
| schema/table relationをreadへ統一 | 線の表示名はtargetのsemanticsから決める。type表示checkboxはtype/returns、数字はevidenceの使用箇所数 |
| expandedY → order | columnごとにorder順、y=上端＋先行groupの現在の高さ＋gapの累積。高さの計算は既存node/tagの寸法を使用 |
| source.locations/signatures | 契約は署名一覧、実コードは許可されたexcerpt。sourceなしを空コードと誤表示しない |
| Unit setupの判別union | 一覧はtest名／Solitary・Sociable・未判定／service mock一覧。根拠の長文を各行に常時並べない |
| HTTP entry内のe2eTests | Unitと別一覧。unknown nameはUIで「名前未解決」と表示し、JSONのnullを書き換えない |
| analysesとunresolved | 全体の取得状況と選択nodeの不足を分ける。空一覧と未収集を区別 |
| middleware/config/composition | 既存のtag・表示切替・app.ts非表示を維持。groupが通常表示ならその可視tagも通常表示 |
| URLの選択・lock | 共通IDで復元。削除/rename済みIDはその選択・lockを解除し通知。別nodeへ勝手に対応させない |

v1 fixtureをv2へ移し、旧schemaで読ませない。手動fixtureはprovenance=manual-fixtureを維持し、組立の出力は必ずextractedにする。本番表示のJSONはextract成功後のv2に切り替える。demoScenariosは抽出データから除き、UIの開発fixtureへ移す。

### 完了の判定：ec-backendで実際に照合する

文書の型検査だけでは下表を達成したことにならない。実装時には実ソースfixtureからJSONを生成し、最後にブラウザで確かめる。

| 照合する場所 | 受入条件 |
| --- | --- |
| graph全体 | ec-backendのinclude範囲のclass/file/interfaceとmemberを列挙。1関数1node、callbackの包含、存在するIDへの参照を検証 |
| 注文取得 | findById→DrizzleService.dbのread、ordersへのread＋table意味、Orderの型参照。架空のRepository/Portなし |
| 注文作成 | transaction/map等のcallbackが別nodeで内部の依存を所有。折りたたみ時だけclass/fileへ集約 |
| HTTP / middleware | createEcAppの各routeと適用middlewareを、共通登録規則の期待値と照合。親子mount・skip・同名controller・同class複数mountも別fixtureで検証 |
| config | JwtService→JwtConfig等のproperty/getter依存が残る。config表示を切っても実データは消さない |
| event / lifecycle | OrderHandlersの購読callbackと同じbusのemitを結ぶ。別app/別busの同名eventは結ばない。登録を確認したstartup/shutdownのみ入口 |
| Unit | JwtService.signの直接callを持つ4caseを一覧化。各setupのtarget由来とconfig差替えを保持し、joseをmock一覧へ入れない |
| E2E | 静的なdirect/helper requestを同じappのHTTP entryへ付ける。動的URLや共有hookの不足はpartialとして見える |
| 任意plugin | Zelt無効でもTSの箱・ID・read/callは同じ。appをimportしない。runner差替えの共通契約を偽pluginで検証 |
| 再現性と失敗 | plugin順を変えてbyte一致。不正ID/別revision/競合/worker失敗/required不足でpublishせず旧ファイルのhashが変わらない |
| Studio | 生成JSONをfetchし、選択近傍・双方向の独立再帰・lock・折りたたみ・可視tagだけの高さ・Unit/E2E一覧・reloadを回帰検証 |

実装順は依存する箱に沿って、schema＋索引 → plugin＋inspection → 組立/publish → UI接続。各箱の契約テストを先に置く。Vitest以外のrunner、任意JSの実行結果推定、testのin/out値収集、外部plugin配布は初版の完了条件に含めない。

現時点で確認したのは既存ソースのAPIと、この文書の契約・例の整合性まで。抽出器・新inspection・v2 UIは未実装であり、上の受入条件は未検証。

文書検証（2026-09-21）: `node --input-type=module`のインメモリ検証で、TypeScript 6.0.2による12型ブロック＋設定例のstrict型検査はエラー0件。ローカルリンク15件・設定参照先17件の存在、JwtService.signの直接call 4件、findByIdのdb/table参照を確認。`git diff --check`と本文の行末空白検査も成功。未検証: Mermaidの実描画、読みやすさのユーザー評価、抽出器とUIの動作。
