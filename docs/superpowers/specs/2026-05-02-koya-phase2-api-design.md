# koya Phase 2: @koya/core API 設計

> Phase 1 (skeleton scaffolding, commit 8fa478a) の完了を前提に、`@koya/core` の公開 API を設計する。本 spec は Phase 2 (1) App + Routing 基盤を対象とし、(2) DI binding API / (3) Error handling + Validation contract / (4) Testing utility は別 phase で扱う。

## 1. コンセプト

TypeScript で、Laravel/FuelPHP のように「アプリケーションを書く」ための高速・型安全なフレームワーク。

Hono の速度、Needle-DI の小さな依存集約、Valibot のスキーマ駆動な型安全性を土台にして、HTTP・DI・validation・lifecycle・testing・worker/CLI を一貫したアプリケーション体験として扱う。

> A fast, type-safe application framework for TypeScript, bringing Laravel/FuelPHP-like productivity to edge and serverless runtimes.

### 中核価値

- **Fast**: Cloudflare Workers や serverless cold start でも実用的な起動速度・実行速度。小さく起動し、必要なものだけを組み立てる。
- **Type-safe**: schema、request、controller、response、DI、test double が型でつながる。実行時 validation と TypeScript 型が同じ契約から導かれる。
- **Application-oriented**: HTTP toolkit ではなく、Laravel/FuelPHP 的にアプリケーションの骨格を提供する。Entry、service、repository、config、lifecycle、error handling、testing、CLI/worker を同じ設計思想で扱う。

---

## 2. 概念モデル

koya のアプリケーションは 2 つの構成要素からなる。

### 2.1 Provider

DI で解決される依存。Service / Repository / **Adapter**（外部 SDK や DB client、設定値などの外部境界をラップする class）など。アプリケーションのビジネスロジックは Service / Repository に、外部境界は Adapter に集約される。

明示的な provider 登録は行わない。Entry の constructor 引数で `inject(X)` を宣言すると、`@needle-di/core` の auto-bind が依存グラフを辿って解決する。Provider DSL（`useFactory` / `useValue` / `useClass` / scope 制御）も採用しない（§4.10）。

### 2.2 Entry

**アプリケーションの外部から内部への入口**。トリガーの種類によって複数の種類がある。

| Entry 種別 | トリガー | decorator | MVP (Phase 2 (1)) |
|---|---|---|---|
| HttpController | HTTP request | `@Controller` | ✓ |
| CronEntry | スケジュール | `@Cron` | 将来 |
| QueueEntry | queue message | `@Queue` | 将来 |
| CliCommand | プロセス起動 | `@Command` | 将来 |

すべての Entry は同じ DI container / Entry-scoped context / error pipeline の上で動く。違うのは「トリガーの種類」と「入力の取り方」だけ。

この抽象により:

- HTTP / Cron / Queue / CLI を同格に扱える (edge/serverless 時代の現実に整合)
- Entry をまたいで Provider を共有できる (例: 同じ `Database` を HTTP と Cron で使う)
- Entry 単位で bundle を分けられる (Fast の担保)

> 注: Entry はクラス継承を強制しない概念モデル。ユーザーが書くのは普通のクラス + decorator。

---

## 3. 技術スタック

| レイヤ | 採用 | バージョン |
|---|---|---|
| HTTP | Hono | 4.12.16 |
| DI | @needle-di/core | 1.1.2 |
| Validation | Valibot | 1.3.1 |
| Decorator | TypeScript legacy decorator (`experimentalDecorators: true` / **reflect-metadata なし**) | TS 6.0.2 |
| Bundler | tsdown | 0.21.10 (oxc decorate helper inline 対応版) |
| Request Context | AsyncLocalStorage | Node 22 / Workers `nodejs_compat` |

### 採用しないもの

- **reflect-metadata**: bundle size と cold start にネガティブ。`@needle-di/core` は reflect-metadata を要求しないため、`experimentalDecorators` を有効にしても reflect-metadata は import しない (Phase 2 開始時の spike で確認、§10 #11)
- **TC39 Stage 3 decorator (構文)**: 当初採用予定だったが、koya の toolchain (vite 8 / tsdown / rolldown / oxc) が Stage 3 decorator 構文を transpile せず、Node.js v22/v24 がネイティブにパースできないため `SyntaxError` になる。実装上は legacy decorator を採用 (§10 #11)
- **codegen / TypeScript Compiler API**: TS バージョン依存が個人プロジェクトのメンテ負荷として重く、本仕様の設計では不要にできる

なお、neverthrow は framework として定義しない（§4.9）。利用者が任意で使うのは妨げず、Phase 1 spec section 8 で公開 API の `Result`/`ResultAsync` 露出も許容済み（§9.4）。

---

## 4. 設計上の重要な判断

### 4.1 hono / DI コンテナ非露出 (server side) / hono client 利用 (client side)

ユーザーが書くのは Entry クラスと Provider。Hono の `Context` には **直接触らせない**。response 制御は `response()` primitive の戻す **`ResponseBuilder`** を経由する。

公開 API として `hono.Context` / `Hono` クラス本体 / `@needle-di/core.Container` 等は引き続き露出してはならない。`ResponseBuilder` の戻り値型 `TypedResponse<T, S, F>` は hono 由来の型だが、利用者は **そのまま return する** だけで触ることはなく、AppType の解析対象として使われる。

client 側 (`hc<AppType>` を呼ぶ側) は hono の `hono/client` を **直接利用** する。これは server 側の隠蔽と独立した方針で、hono の成熟した RPC client 機構を再発明しないため。`HTTPException` は `@koya/core` から re-export されており、利用者は hono 直接 import を行わない。

> 本節は Phase 2 (2) で response 系 primitive 確立時に更新された (server 側 Context 非露出維持 / client 側 hc 直接利用許容 / `HTTPException` re-export)。

### 4.2 引数のデフォルト値で「値の出所」を宣言する

NestJS 的なパラメータデコレーター (`@Body() body: CreateUserBody`) は採用しない。理由:

- Stage 3 decorator はパラメータデコレーターを未サポート
- デコレーターと引数型注釈の二重定義は型安全ではない (片方を変えても TypeScript が検出できない)

代わりに、**引数のデフォルト値**で値の出所を宣言する:

```ts
async create(body = validated(CreateUserBody)) { }
```

`validated()` の戻り値型が `InferOutput<typeof CreateUserBody>` になるため、`body` の型は schema から完全に推論される。schema は 1 箇所のみ、識別子の参照も 1 箇所のみ。乖離不可能。

### 4.3 validation は handler 内で lazy に行う

Hono の middleware パターンとは異なり、koya は handler 内で `validated()` が呼ばれた時点で validate する。

- validation エラーは `validated()` が throw する
- framework の global error handler でキャッチして 400 を返す
- middleware 事前検証を不要にすることで codegen が不要になる

### 4.4 codegen は不要

handler 内 lazy validation により、framework がメソッドのシグネチャを事前に知る必要が消える。AST 解析・TypeScript Compiler API・reflect-metadata のいずれも不要で、純粋に Stage 3 decorator + 関数呼び出しのデフォルト値だけで成立する。

### 4.5 Entry は明示列挙で登録する

side-effect import 方式や barrel export 方式は採用しない。理由:

- tree-shaking が確実に効かない (グローバル副作用)
- entry 別 bundle が原理的に成立しない

代わりに、Application と Entry を明示的に列挙する。これにより:

- entry 別に bundle を分けられる (HTTP bundle / CLI bundle / Cron bundle)
- 各 bundle に必要なコードだけが含まれる
- bundler が dependency graph を正確に辿れる
- 何が登録されているか一目で分かる
- IDE の jump-to-definition が効く

NestJS の Module 概念は採用しない。Module は monolithic Node.js を前提にした抽象で、entry が複数ある edge/serverless の現実に合わない。Application + Entry の 2 階建てで足りる。

### 4.6 DI container は Entry runtime が持つ

`createHttpApp({ controllers })` 等の Entry runtime factory が DI container を内部で構築する。MVP では HTTP のみ。複数の Entry runtime を同居させる場合は §6.3 を参照。

DI scope は 2 種類:

- **Singleton**: container 内で 1 度だけ生成 (default、`@needle-di/core` 標準)
- **Entry scope (request scope)**: Entry の 1 回の起動 (1 request / 1 cron tick / 1 queue message / 1 CLI 実行) の間有効。`pathParam()` / `validated()` 等の **method 引数 default primitive** がこの scope の値を取得する (AsyncLocalStorage、§7.1)

Transient scope は当面採用しない。必要になった時点で別途検討。

### 4.7 Entry には decorator が `@Injectable` を兼ね、Provider には `@Injectable` を付ける

DI 登録の責務分担:

- **Entry** (`@Controller` / `@Cron` / `@Queue` / `@Command`) — Entry decorator が内部で `@needle-di/core` の `@injectable()` 機能を兼ねるため、追加の `@Injectable` 付与は不要
- **Provider (Service / Repository / Adapter)** — `@Injectable()` を付ける。`@koya/core` が `@needle-di/core` の `injectable` を `Injectable` (Pascal case) として re-export する

`@Injectable` を付けた Provider は、Entry の constructor 引数で `inject(X)` を呼ばれた時点で needle-di が auto-bind で解決する。`createHttpApp({ controllers })` に **明示的な provider 列挙は持たない**（§4.10）。

```ts
import { Injectable, inject, Controller, Get } from '@koya/core'

@Injectable()
class Greeter {
  greet(name: string) { return `hello, ${name}` }
}

@Controller('/hello')   // ← @Injectable は不要 (Entry decorator が兼ねる)
class HelloController {
  constructor(private greeter = inject(Greeter)) {}
  @Get('/:name')
  greet() { /* ... */ }
}
```

framework が強制するのは「DI 登録単位は class」というルール（§9.2）と「Provider は `@Injectable` を付ける」というルールの 2 つのみ。

### 4.8 testing は HTTP integration invoke を提供

`controller.create(testBody)` のような直接呼び出しは TypeScript 引数デフォルト値の挙動上、validation を bypass する（hono の `c.req.json()` を呼ばない、nestjs の `@Body()` decorator が走らないのと同じ）。これは framework 共通の挙動として受け入れる。

外部リクエストをフル検証する unit/integration test 用に、`@koya/testing` から `app.request(path, body)` 相当の HTTP integration invoke API を提供する。これは §8 で「testing utility は (1) スコープ外」とした例外として、Phase 2 (1) で最小限提供する（DI override + simple `request()` のみ）。本格的な testing utility は Phase 2 (4) で扱う。

### 4.9 エラー戦略は throw + global error handler

Provider/Controller は throw で error を伝播する。framework の global error handler が catch して response 化（validation error → 400 等）。

neverthrow は framework として定義しない。ただし、利用者が任意で使うのは妨げない。Phase 1 spec section 8 で「`Result`/`ResultAsync` は露出 OK」と決めたのは、利用者が public API 境界で Result を返す/受け取ることを framework が阻害しない、という意味であって、framework 自身が Result 駆動になるという意味ではない。

公開 API は Result 型を要求しない。Phase 2 後続フェーズで error handling + validation contract を再設計する際に、この方針を再評価する余地は残す。

### 4.10 外部境界は adapter class が責務として内包する（Provider DSL を持たない）

外部リソース（DB connection / 外部 API client / 設定値 / async init resource）は **adapter class** が責務として内包する。framework は Provider DSL（`useFactory` / `useValue` / `useClass` / scope 制御）を **持たない**。`createHttpApp({ controllers })` には `providers` フィールドも `.provide()` メソッドも存在しない。

#### 根拠

- 外部 SDK の構築詳細（API key 取得、async init、再接続）をアプリケーション層に直接 inject するのは layering violation。SDK と外部設定は adapter class 内部にカプセル化するのが凝縮度の観点で正しい
- Provider DSL は「Token → 値の bind」という OOP IoC コンテナの責務範囲。**外部リソースのライフサイクル管理は adapter class の責務**であり、Provider の責務に混ぜると凝縮度が下がる
- `@needle-di/core` は class を `inject(X)` で auto-bind するため、明示的な provider 登録は不要。それ以外の bind が必要なケースは、責務の切り直し（adapter class の導入）で解消できる

#### 旧来パターンとの対応

| 旧来 (Provider DSL を要する形) | koya での書き方 |
|---|---|
| `useValue(STRIPE_API_KEY)` → Stripe client を構築して inject | `class StripeAdapter` が constructor で env 読み出し + Stripe SDK を内包し、`inject(StripeAdapter)` で利用 |
| `useFactory` で `await Database.connect(url)` | `class DatabaseAdapter` が `#conn?: Connection` を保持して lazy init (初回 query 時に connect) |
| `useClass` で interface → 実装差し替え | interface ベースの抽象を採らない。具体 class を直接 inject |
| `useValue` で primitive 設定値 (`API_BASE_URL` 等) | `class Config` が env 読み出しを内包 |

#### 残課題と将来扱い

- **テスト時の依存差し替え**: Provider DSL ではなく `@koya/testing` の resolver override 機構で別途提供（Phase 2 後続フェーズ）
- **起動時の fail-fast**: DB 接続失敗を初回 request 時ではなく起動時に検知したい用途は、将来 startup hook (`onStart()` 等) として別 primitive で扱う（Phase 2 後続フェーズ）

---

## 5. ユーザー向け API

### 5.1 HTTP Entry の基本形

```ts
import { Controller, Post, inject, validated } from '@koya/core'
import * as v from 'valibot'

const CreateUserBody = v.object({
  name: v.string(),
  age: v.number(),
})

@Controller('/users')
export class UserController {
  constructor(private users = inject(Users)) {}

  @Post('/')
  async create(body = validated(CreateUserBody)) {
    return this.users.create(body)
  }
}
```

### 5.2 入力 primitive (MVP)

引数のデフォルト値で使う primitive 関数。Phase 2 (1) では以下 3 つのみ提供。すべて型推論可能。

責務分離:

- `inject` は **constructor 引数 default 専用**。`@needle-di/core` の `inject` を re-export する。`container.get(X)` の resolve スタック内で立つ needle-di context に乗る (§7.1)。
- `validated` / `pathParam` など **request scope の値** を取る primitive は **method 引数 default 専用**。内部実装は AsyncLocalStorage (§7.1)。

| primitive | 用途 | 引数 default 位置 | 戻り値型 |
|---|---|---|---|
| `inject(Class)` | DI コンテナから取得 (`@needle-di/core` の re-export) | constructor | `Class` のインスタンス型 |
| `validated(schema)` | request body を validate | method | `InferOutput<typeof schema>` |
| `pathParam(name)` | URL path parameter | method | `string` |

複数 primitive を組み合わせた例:

```ts
@Controller('/users')
export class PostController {
  // request 非依存の依存は constructor で DI 解決
  constructor(private posts = inject(Posts)) {}

  // request scope の値は method 引数 default で取得
  @Post('/:id/posts')
  async create(
    id = pathParam('id'),
    body = validated(CreatePostBody),
  ) {
    return this.posts.create({ userId: id, ...body })
  }
}
```

`CurrentUser` のような **request scope の値** (= 認証済 user 等) を method 引数 default で取りたい場合は、`inject(CurrentUser)` ではなく専用 primitive (`currentUser()` 等、将来追加) で表現する。これは「DI コンテナ取得」と「request scope の値取得」の責務を分けるため。

#### 将来追加候補（Phase 2 (1) スコープ外）

| primitive | 用途 | 引数 default 位置 | 戻り値型 | 追加タイミング |
|---|---|---|---|---|
| `query(schema)` | query string を validate | method | `InferOutput<typeof schema>` | HTTP 拡張 |
| `header(name)` | request header | method | `string \| undefined` | HTTP 拡張 |
| `currentUser()` 等 | 認証済 user など request scope の値 | method | 利用者定義型 | request scope DI が必要になった時 |
| `cronContext()` | Cron 実行時の context | method | Cron トリガー情報 | Cron Entry 導入時 |
| `queueMessage(schema)` | Queue メッセージ | method | `InferOutput<typeof schema>` | Queue Entry 導入時 |
| `cliArg(name)` `cliFlag(name)` | CLI 引数・フラグ | method | string / boolean 等 | CLI Entry 導入時 |

### 5.3 各 Entry の Decorator

#### HTTP (MVP)

```ts
@Controller('/users')
export class UserController {
  @Get('/')      list() { }
  @Get('/:id')   show() { }
  @Post('/')     create() { }
  @Put('/:id')   update() { }
  @Patch('/:id') patch() { }
  @Delete('/:id') destroy() { }
}
```

#### Cron / Queue / CLI (将来)

将来追加候補。仕様は元案として残すが、Phase 2 (1) では実装しない。

```ts
// 将来
@Cron('0 * * * *')
export class HourlyReportCron {
  constructor(private reports = inject(Reports)) {}
  async run(ctx = cronContext()) {
    await this.reports.generateHourly()
  }
}

@Queue('emails')
export class EmailQueueConsumer {
  constructor(private mailer = inject(Mailer)) {}
  async handle(message = queueMessage(EmailMessageSchema)) {
    await this.mailer.send(message)
  }
}

@Command('migrate')
export class MigrateCommand {
  constructor(private db = inject(Database)) {}
  async run(fresh = cliFlag('fresh')) {
    if (fresh) await this.db.dropAll()
    await this.db.migrate()
  }
}
```

decorator が持つ情報は **トリガー条件のみ** (path, method, cron 表現, queue 名, command 名)。引数情報は含めない。

---

## 6. アプリケーション起動

### 6.1 HTTP App の生成

```ts
import { createHttpApp } from '@koya/core'

const worker = createHttpApp({
  controllers: [UserController, PostController],
}).toWorker()

export default worker
```

`createHttpApp` の入力は **controllers のみ**。Service / Repository / Adapter は `inject(X)` 経由で auto-bind されるため、明示登録は不要（§4.10）。`providers` フィールドや `.provide()` メソッドは存在しない。

### 6.2 Entry 別 bundle (推奨パターン)

各 entry を別ファイルに分け、bundler が dependency graph で必要なコードだけ含める。

```ts
// entries/http.ts
import { createHttpApp } from '@koya/core'
import { UserController } from '../controllers/user.controller'

export default createHttpApp({
  controllers: [UserController],
}).toWorker()
```

将来 Cron / Queue / CLI を導入した場合は、それぞれ独立した factory（`createCronApp` / `createQueueApp` / `createCliApp` 等、命名は将来確定）を別 bundle で使う:

```ts
// entries/cli.ts (将来)
import { createCliApp } from '@koya/core'
import { MigrateCommand } from '../commands/migrate'

createCliApp({
  commands: [MigrateCommand],
}).run(process.argv)
```

HTTP bundle に CLI コードは含まれず、CLI bundle に HTTP controller は含まれない。各 bundle が最小化される。

### 6.3 統合 entry (将来: Workers の複数 handler 対応)

Cloudflare Workers では 1 つの worker file が `fetch` / `scheduled` / `queue` を同時に export することがある。この用途は将来 Phase で扱う（Phase 2 (1) では対応しない）。

設計の方向性として、複数 Entry runtime 間で同じ adapter インスタンス（例: `DatabaseAdapter`）を共有したい場合は、外部 module top-level で構築するか、共通 container を渡す API を別途追加する形を検討する。本 phase では `createHttpApp` のみが存在し、container は HTTP App 内部に閉じる。

---

## 7. 実装メモ

### 7.1 request-scoped context

method 引数 default で使う primitive (`validated()` / `pathParam()` 等) は AsyncLocalStorage で「現在処理中の Entry 実行」にアクセスする。`inject()` はこの仕組みに乗らず、`@needle-di/core` の constructor injection 機構 (`container.get(X)` の resolve スタック内で立つ context) で動く。

```ts
// 概念実装
const entryStorage = new AsyncLocalStorage<EntryContext>()

export function validated<S extends BaseSchema>(schema: S): InferOutput<S> {
  const ctx = entryStorage.getStore()
  if (!ctx) throw new Error('validated() called outside entry execution')
  return v.parse(schema, ctx.input.body)
}

// inject は @needle-di/core から re-export するだけ (独自 ALS 実装はしない)
export { inject } from '@needle-di/core'
```

Cloudflare Workers では `nodejs_compat` flag で AsyncLocalStorage が利用可能。

### 7.2 Entry の登録と DI

- Entry は legacy decorator (`experimentalDecorators: true`) が実行されたタイミングでクラスにメタデータが付与される (decorator 引数のみ)
- `createHttpApp({ controllers })` 起動時、controllers を走査してルートを構築する
- Entry のインスタンスは `@needle-di/core` の container から解決される
- `constructor(private users = inject(Users))` の形で書かれた依存も同じ container から auto-bind で解決される
- Entry decorator が `@needle-di/core` の `@injectable()` 機能を兼ねるため、ユーザーが追加で `@injectable()` を書く必要はない（§4.7）
- Service / Repository / Adapter は **`@Injectable` を付けるだけで** auto-bind される。`createHttpApp({ controllers })` に明示列挙する必要はない（§4.10）

### 7.3 各 Runtime factory の出力

| factory | 出力 | MVP |
|---|---|---|
| `createHttpApp({...}).toWorker()` | `{ fetch: (req, env, ctx) => Response }` | ✓ |
| `createHttpApp({...}).toNode()` | Node.js HTTP server | 将来 |
| `createCronApp({...}).toWorker()` | `{ scheduled: (event, env, ctx) => void }` | 将来 |
| `createQueueApp({...}).toWorker()` | `{ queue: (batch, env, ctx) => void }` | 将来 |
| `createCliApp({...}).run(argv)` | プロセス実行 | 将来 |
| 統合 worker (`fetch` + `scheduled` + `queue` 合成) | 上記を 1 つの handler に合成 | 将来（§6.3） |

---

## 8. スコープ

### 8.1 MVP (Phase 2 (1)) に含めるもの

- HTTP App factory (`createHttpApp({ controllers })`)
- HTTP Entry: `@Controller`, `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`
- 入力 primitive: `inject()`, `validated()`, `pathParam()` の 3 つ
- Hono ベースの HTTP Runtime (`createHttpApp().toWorker()`)
- AsyncLocalStorage ベースの Entry-scoped context
- global error handler (validation error → 400 等)
- `@needle-di/core` 統合（auto-bind による暗黙登録、明示 provider 登録は持たない）
- `@koya/testing` から最小限の HTTP integration invoke (`testApp.request(path, body)` 相当)

### 8.2 Phase 2 後続フェーズで扱うもの

| Phase | スコープ |
|---|---|
| (2) Error handling + Validation contract | error → response mapping、validation error の構造化、Result 型の再評価可否 |
| (3) Testing utility | resolver override（依存差し替え）、request mocking、time/clock mock、in-memory database、HTTP fixture |
| (4) Lifecycle hook | startup hook (`onStart` 等) で外部リソースの fail-fast 初期化（§4.10 残課題） |

> 旧計画にあった「DI binding API (`useFactory` / `useValue` / scope 制御 / Provider DSL)」はフェーズから削除した。設計判断は §4.10 / §10 #12 を参照。

### 8.3 当面採用しないもの (将来検討)

- Cron / Queue / CLI の Entry 種別
- 統合 worker entry (`app.toWorker({...})`)
- 追加 primitive: `query()`, `header()`, `cronContext()`, `queueMessage()`, `cliArg()`, `cliFlag()`
- middleware 抽象
- config 抽象、env 管理
- response の型付け抽象
- OpenAPI 生成
- Feature 単位の Entry グループ化

---

## 9. 制約事項

### 9.1 環境制約

- TypeScript 6.0+ を前提とする
- 実行環境は Cloudflare Workers / Node.js / Bun / Deno を想定
- `reflect-metadata` を import してはならない (`@needle-di/core` も要求しない)。CI で `grep` 検証 (§9.3)
- `experimentalDecorators: true` を **有効にする** (§3 / §10 #11、Stage 3 syntax は toolchain 制約で不採用)
- `tsdown` は 0.20.x 以降 (oxc decorate helper inline 対応版) を使う。0.9.x では `__decorate` helper が external 参照のまま残り `ERR_MODULE_NOT_FOUND` になる
- AsyncLocalStorage が利用可能な環境を前提とする (Workers では `nodejs_compat` 必要)

### 9.2 class 使用ルール

CLAUDE.md ルール「class 禁止、DI コンテナのみ例外」と本spec の class 多用パターンを整合させる。「class が許される = `@needle-di/core` の DI 登録単位として bind されるもの」と定義する。

| 種別 | class | 関数+readonly |
|---|---|---|
| Entry (`@Controller` / `@Cron` / `@Queue` / `@Command`) | ✓ | × |
| Provider (DI 登録単位、`@injectable()` 含む) | ✓ | × |
| ドメインオブジェクト / 値オブジェクト | × | ✓ |
| pure logic / utility | × | ✓ |
| 設定オブジェクト / data record | × | ✓ |

framework の内部実装も同じルールに従う。Entry/Provider 以外で class を使う設計提案は本spec の方針に反する。

### 9.3 Hono 型隠蔽 (CI 検証)

framework の dist 出力に hono 由来の型が含まれてはならない。CI で以下相当を検証する:

```bash
grep -RE "from ['\"]hono" packages/core/dist/*.d.ts && exit 1 || true
```

`hono.Context` / `Hono` 等の型が利用者の TypeScript 型解決経路に現れたら fail。Phase 1 申し送り (b) として GitHub Actions に追加する（Phase 2 plan のタスク）。

**ホワイトリスト (Phase 2 (2) §4.1):** 以下の import 行はリーク検出の対象外とする。CI の grep は当該行を除外した上で残存する hono 参照を検出し、それ以外の hono 参照は引き続き fail となる。

| 許可行 | 理由 |
|--------|------|
| `import { HTTPException } from "hono/http-exception";` | Phase 2 (2) の意図的な re-export (§4.1) |
| `import { TypedResponse } from "hono";` | `ResponseBuilder` の戻り値型として公開 API に必要 |
| `import { ContentfulStatusCode } from "hono/utils/http-status";` | `ResponseBuilder` のステータスパラメータ型として公開 API に必要 |

### 9.4 公開 API 禁止リスト（Phase 1 spec section 8 継承）

以下は公開 API として export してはならない:

- `Context` (hono)
- `Hono` (hono)
- `Container` (`@needle-di/core`)

以下は公開 API で受け取ってよい / 露出してよい:

- valibot の `BaseSchema` 系（`validated()` 等の引数）
- neverthrow の `Result` / `ResultAsync`（利用者が return 値として使う場合のみ。framework 自身は Result を要求しない）

---

## 10. 検討経緯の要約

1. **NestJS 風 `@Body() body: CreateUserBody`** → Stage 3 でパラメータデコレーター未対応、legacy + reflect-metadata は cold start に響くため不採用
2. **decorator option + 型注釈** (`@Post('/', { body: schema })` + `InferRequest<...>`) → 二重定義は乖離検出不能で型安全ではないため不採用
3. **関数型 route** (`route.post('/', { body, handler })`) → クラス構造が壊れる、`this` 問題、DI との相性が悪く不採用
4. **codegen による AST 解析** → TypeScript Compiler API 依存で TS バージョンが固定され、個人プロジェクトのメンテ負荷として重く不採用
5. **引数のデフォルト値で値の出所を宣言** (`body = validated(schema)`) → schema 単一定義、型完全推論、decorator 不要、codegen 不要、reflect-metadata 不要、クラス構造保持。**採用**
6. **Entry 抽象の導入** → HTTP / Cron / Queue / CLI を同格に扱うため、「プレゼンテーション層」ではなく「外部からの入口 = Entry」として再定義。hexagonal architecture の driving adapter に相当
7. **Application + Entry の 2 階建て** → NestJS の Module は monolithic 前提のため不採用。Entry 別 bundle (Fast) と DI 共有 (統合 worker) の両立のため、DI container は Application が持つ構造に
8. **`@injectable()` を Entry decorator が兼ねる** → ユーザー記述量を最小化。NestJS の `@Controller` が `@Injectable()` を兼ねるのと同じ感覚
9. **neverthrow を framework として定義しない** → Phase 1 spec section 8 の「Result 露出 OK」は利用者の自由を保証する意であり、framework が Result 駆動になる意ではないと整理。Phase 2 (3) で再評価の余地は残す
10. **`inject` の責務分離** → 当初 `inject(CurrentUser)` を method 引数 default で使う想定 (`@needle-di/core` 由来か koya 独自 ALS-based か、設計が割れる) だったが、「DI コンテナ取得は `inject` で constructor 引数 default 専用 (needle-di 標準 re-export)、request scope の値は専用 primitive (`pathParam` / `validated` / 将来 `currentUser` 等) で method 引数 default」と責務分離する形に整理。`inject` の独自実装は不要
11. **decorator 実装方式 (Stage 3 → legacy)** → Phase 2 開始時の spike で、koya の toolchain (vite 8 / vitest 4.1.5 / tsdown 0.9.3 / rolldown / oxc) が Stage 3 decorator 構文を transpile せず、Node.js v22/v24 がネイティブにパースできないため、`@deco class X {}` を書いた瞬間に build/test が `SyntaxError` になることが判明。**Stage 3 構文を諦めて legacy decorator (`experimentalDecorators: true`) を採用**する。reflect-metadata は引き続き要求しない (`@needle-di/core` が reflect-metadata 非依存設計のため)。tsdown は 0.20.x 以降 (oxc decorate helper inline 対応版) が必要 (`tsdown@0.21.10` に bump)。jexer-reserve (sibling project) で同パターンが実証済
12. **Provider DSL 廃止** → 当初の `createApp({ providers })` + 後続 phase での `useFactory` / `useValue` / `useClass` / scope 制御 DSL を完全に廃止。ユースケース精査で、(a) 外部 SDK / 設定値の inject は adapter class が内包すべき責務であり Provider DSL の管轄外、(b) async init は Provider の責務ではなくリソースのライフサイクル管理問題、(c) test override は testing 専用 API で別途提供、と整理。これらは Provider 責務の超過であり、framework として DSL を持つこと自体が凝縮度を壊す。`createHttpApp({ controllers })` 単一形・`providers` フィールドなし・`.provide()` メソッドなし、と決定 (§4.10)
13. **Application 抽象廃止 (`createApp` → `createHttpApp`)** → Phase 2 (1) には HTTP runtime しか存在しないため、`createApp({...}).http({...})` の 2 段階は API duplication（`controllers` を 2 箇所で指定する形）を生む。Application という共通親抽象は YAGNI 違反であり廃止。`createHttpApp({ controllers })` 単一形に統一。将来 Cron / Queue / CLI を追加する際は `createCronApp` / `createQueueApp` / `createCliApp` を並列に追加する形（共通親型は持たない）(§6.1 / §6.3)

---

## 11. brainstorming 確定事項 (2026-05-02)

| # | 論点 | 確定 |
|---|---|---|
| 1 | controller 直接呼び出しでの validation skip | framework 共通の挙動として許容。`app.request(path, body)` 相当の HTTP integration invoke を `@koya/testing` で提供（§4.8） |
| 2 | neverthrow との整合 | framework として定義しない。利用者が任意で使う。本spec で import なし（§4.9） |
| 3 | Phase 1 申し送り (init-design spec section 13.5) 取り込み | (a) class ルール → §9.2 / (b) Hono 型隠蔽 grep CI → §9.3 / (c) 逸脱 #1〜#3 逆転 → §12 |
| 4 | needle-di `@injectable()` 関係 | Entry/Provider に `@injectable()` 不要、Entry decorator が兼ねる。任意の class への `@injectable()` 付与は許容（§4.7） |
| 5 | MVP スコープ | §8.1 = Phase 2 (1)、(2)(3)(4) は (1) 完了後の拡張 |
| 6 | `inject` の責務 | constructor 引数 default 専用、`@needle-di/core` の re-export。method 引数 default で DI したい用途は専用 primitive (`pathParam` / `validated` / 将来 `currentUser` 等) で表現 (§5.2 / §7.1 / §10 #10) |
| 7 | Provider DSL の要否 | 廃止。`providers` / `.provide()` / `useFactory` / `useValue` / `useClass` / scope 制御 などの DSL は持たない。controllers の auto-bind で解決し、外部境界は adapter class が責務として内包 (§4.10 / §10 #12) |
| 8 | Application 抽象の要否 | 廃止。`createApp().http()` の 2 段階は controllers の二重指定を生むため、`createHttpApp({ controllers })` 単一形に統一。共通親型は持たない (§6.1 / §10 #13) |

---

## 12. Phase 1 逸脱事項の逆転

Phase 1 init-design spec section 13.5 で Phase 2 に申し送られた逸脱 #1〜#3 を、本 phase の実装段階で逆転する:

| # | Phase 1 逸脱状態 | Phase 2 で逆転後 |
|---|---|---|
| 1 | `packages/testing/tsconfig.json` から core への `references` を削除（dogfood test の循環参照回避） | core の API が確定したら、testing が core に依存する形で `references: [{ path: "../core" }]` を testing 側に追加 |
| 2 | `packages/testing/package.json` の `dependencies` から `@koya/core` を削除（Nx 循環依存回避） | testing が core の testing utility を提供するため、`peerDependencies` または `devDependencies` として `@koya/core: workspace:*` を追加 |
| 3 | `packages/core/src/index.test.ts` の dogfood が `@koya/testing` の `__version` import に逆向きで依存 | core が API を提供する側に変わるため、`@koya/testing` 側の test で `@koya/core` の API を直接利用する形に書き直す |

詳細手順は Phase 2 plan で対応タスク化する。

---

## 13. Phase 2 plan で扱う作業項目

`docs/superpowers/plans/2026-05-02-koya-phase2-api.md` で扱う主要タスク:

1. `@koya/core` 公開 API 実装 (§5–6)
   - `createHttpApp` / `HttpApp` 型 (`providers` / `.provide()` を持たない)
   - `@Controller` / `@Get` / `@Post` / `@Put` / `@Patch` / `@Delete` decorator
   - `inject` / `validated` / `pathParam` primitive
   - Hono ベース runtime (`createHttpApp({ controllers }).toWorker()`)
   - AsyncLocalStorage Entry-scoped context
   - global error handler
2. `@koya/testing` の最小 HTTP integration invoke API (§4.8 / §8.1)
3. CI に Hono 型隠蔽 grep check 追加 (§9.3)
4. 逸脱 #1〜#3 の逆転 (§12)
5. `examples/hello` を Phase 2 API でリライトし dogfood として動作確認

---
