# koya Phase 2 (4): Testing utility + HttpApp API 整理

> Phase 2 (1)〜(3) で確立した `createHttpApp({ controllers })` と global error handler を前提に、テスト容易性を担保する 2 つの変更を行う:
>
> 1. `@koya/core` の `HttpApp` API を hono 互換に整理（`toWorker()` を廃し、`fetch` / `request` を直接公開）
> 2. `@koya/testing` に `createTestContainer` を新設（needle-di の child container パターンによる DI mock util）
>
> 本 spec は @koya/core HttpApp shape 変更と @koya/testing の `createTestContainer` 追加を対象とし、type-level public API shape test (Phase 2 (3) reviewer Low) と Phase 2 (5) Lifecycle hook は別 phase で扱う。

## 1. ゴール

- **テスト専用 API を作らない**。本番と同じ `createHttpApp()` の戻り値が hono と同じ `fetch` / `request` を持ち、HTTP integration テストはそのまま runtime API で書ける
- `@koya/testing` は service unit テスト向けの DI mock util (`createTestContainer`) のみを提供する。HTTP 統合のための shim (`createTestApp`) は廃止

### 中核原則

- **本番 API = テスト API**: hono の `app.fetch` / `app.request` を `createHttpApp()` の戻り値にそのまま乗せる。test util として並行 API を作らない
- **DI mock = needle-di の child container パターン**: jexer-reserve の `createTestContainer` 実装を 1:1 で踏襲。base → child の 2 段階 bind で defaults と per-test overrides を分離
- **YAGNI**: time/clock mock / HTTP fixture / in-memory database / type-level public API shape test は本 phase スコープ外

---

## 2. 概念モデル

### 2.1 HttpApp の役割整理

| API | 役割 | 呼び出し主体 |
|---|---|---|
| `app.fetch(req)` | 低レベル Fetch handler。`Request → Promise<Response>` | runtime (Workers / Bun / Deno)、`export default app` で entry になる |
| `app.request(input, init?)` | path 文字列 or `Request` を受ける ergonomic shortcut。内部で Request を組み立てて `fetch` に渡す | テスト、手書きスクリプト |

実装的には `request` が内部で Request を生成して `fetch` を呼ぶだけ。両者を持つことで「runtime が呼ぶ低レベル」と「人間が書く ergonomic」を 1 オブジェクトで両立する（hono と同じ二層構造）。

### 2.2 テストレベルの責務分離

| レベル | 何をテスト | koya で何を使うか |
|---|---|---|
| Unit | service の純ロジック（DI 依存を mock） | `@koya/testing` の `createTestContainer` |
| Integration | controller + routing + validation を含む組み立て | `@koya/core` の `createHttpApp({controllers}).request(...)` 直接 |
| e2e | 本物の adapter（Workers / Node 上）に対する fetch | adapter のテスト or 外部から fetch（@koya/testing の責務外） |

### 2.3 createTestContainer の base / child モデル

needle-di の `Container.createChild()` 挙動を利用:
- **base container** にプロジェクト共通の dummy default を bind（global cache、初回呼び出し時に lazy 生成）
- 各 test 呼び出しで **child container** を `base.createChild()` で派生
- child に per-test の `providers` を bind → child の bind が parent default を override（needle-di は `child.get(token)` 時に child の providers map を先に見て、なければ parent にフォールバック）
- target は `child.get(targetClass)` で解決し、`{ target, container: child }` を返す

---

## 3. 技術スタック

| レイヤ | 採用 | バージョン |
|---|---|---|
| DI コンテナ | `@needle-di/core` | 既存依存（@koya/core が既に使用中） |
| テストランナー | `vitest` | `>=4 <5`（@koya/testing peerDep として既設定済み） |
| HTTP runtime | `hono` | `4.12.16`（@koya/core 既存） |

新規依存は追加しない。`@koya/testing` の `peerDependencies.@needle-di/core` を新規に明示する（`Token` 型を import するため）。

---

## 4. 公開 API

### 4.1 `@koya/core` HttpApp 改修

```ts
// packages/core/src/http/app.ts
export type CreateHttpAppOptions = {
  readonly controllers: readonly ControllerClass[];
};

export type HttpApp = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
};

export const createHttpApp = (options: CreateHttpAppOptions): HttpApp;
```

**変更点:**
- 既存 `HttpApp = { toWorker(): WorkerHandler }` を上記に置き換え
- `WorkerHandler` 型は削除（barrel export からも外す）

**`request` の挙動:**
- `input` が `string` の場合: `new Request(new URL(input, 'http://localhost'), init)` で Request を組み立てて `fetch` に渡す
- `input` が `Request` の場合: `init` は無視（Request 既に組み上がっているため）してそのまま `fetch` に渡す
- ベース URL `http://localhost` はテスト用ダミーで意味を持たない（hono と同じ慣例）

**Workers entry:**
```ts
// 利用者コード
const app = createHttpApp({ controllers: [...] });
export default app;  // app.fetch が runtime に拾われる
```

### 4.2 `@koya/testing` `createTestContainer` 追加

```ts
// packages/testing/src/test-container.ts
import { Container, Token } from '@needle-di/core';

let baseContainer: Container | null = null;

type PickedProvider<T> = {
  provide: Token<T>;
  useValue: Partial<T>;
};

type CreateContainerParams = <T, A extends any[]>(
  token: Token<T>,
  providers?: { [K in keyof A]: PickedProvider<A[K]> },
) => { target: T; container: Container };

export const createTestContainer: CreateContainerParams = (targetClass, providers) => {
  const baseContainer = getBaseContainer();
  const childContainer = baseContainer.createChild();
  providers?.map((p) => childContainer.bind(p));
  const target = childContainer.get(targetClass); // 依存関係を解決してインスタンスを生成
  return { target, container: childContainer };
};

const getBaseContainer = () => {
  if (baseContainer) {
    return baseContainer;
  }
  baseContainer = new Container();

  // 本来は利用側で必要なものをdummy inject する
  // (koya framework 自体は default 持たない)

  return baseContainer;
};
```

```ts
// packages/testing/src/index.ts
export { createTestContainer } from './test-container';
```

**API 契約 (jexer-reserve 実装と完全一致):**
- 第 1 引数: `Token<T>` (typically `Class<T>`)
- 第 2 引数: `PickedProvider<T>[]` (`{ provide, useValue: Partial<T> }`) optional
- 戻り値: `{ target: T; container: Container }`
- `container` は needle-di の `Container` を直接返す（wrap しない）

**設計判断:**
- 実装は jexer-reserve の `packages/core/src/test/test-container.ts` を 1:1 でコピー（プロジェクト固有 import のみ削除）
- `let baseContainer: Container | null` の global cache パターンを踏襲（CLAUDE.md「NEVER global state」原則の例外として、test util ファイル内 cache であり runtime には漏れない）
- koya framework 自体は dummy default を bind しない（`getBaseContainer()` 内の bind は空）

### 4.3 削除する API

| File / Symbol | 理由 |
|---|---|
| `packages/testing/src/test-app.ts` (`createTestApp`, `TestApp`) | 本 phase で「test 専用 HTTP shim を作らない」方針に基づき廃止。代替は `createHttpApp(...).request(...)` 直接利用 |
| `packages/testing/src/test-app.test.ts` | 上記削除に伴う |
| `packages/core/src/http/app.ts` の `WorkerHandler` 型 / `HttpApp.toWorker()` | hono の `app.fetch` 直接公開で代替。`export default createHttpApp({...})` の方が利用者にとって自然 |

---

## 5. ファイル変更一覧

| Path | 変更 |
|---|---|
| `packages/core/src/http/app.ts` | `HttpApp` shape 変更 / `toWorker()` + `WorkerHandler` 削除 / `fetch` + `request` 追加 |
| `packages/core/src/http/app.test.ts` | 既存改修。`describe('createHttpApp().toWorker()', ...)` を `describe('createHttpApp()', ...)` にリネームし、内部の `createHttpApp(...).toWorker().fetch(req)` を `createHttpApp(...).fetch(req)` に置換。さらに `request()` 4 ケース (path-only / path+init / raw Request / Request+init 無視) を追加 |
| `packages/core/src/index.ts` | `WorkerHandler` export 削除（`HttpApp` 型は shape 変わるが export 自体は維持） |
| `packages/testing/src/test-container.ts` | 新規。jexer-reserve 実装の 1:1 コピー |
| `packages/testing/src/index.ts` | `createTestApp` export を `createTestContainer` export に置換 |
| `packages/testing/src/test-app.ts` | 削除 |
| `packages/testing/src/test-app.test.ts` | 削除 |
| `packages/testing/package.json` | `peerDependencies` に `@needle-di/core` (`1.1.2`) を追加。`@koya/core` の transitive dependency 経由でも resolve できるが、`Container` / `Token` を直接 import するため明示する |
| `examples/hello/src/main.ts` | `app.toWorker();` → そのまま `export default app;` に置換（`fetch` プロパティで Workers entry になる） |
| `examples/hello/src/test/hello.e2e-spec.ts` | `const worker = app.toWorker(); ... worker.fetch(...)` → `app.fetch(...)` 直接利用に置換 |

---

## 6. 制約事項

### 6.1 `let baseContainer` の global cache

CLAUDE.md「NEVER global state」原則に対する明示的な例外。理由:
- runtime コードには影響せず、`@koya/testing` package 内の test 専用 file に閉じている
- needle-di の `Container.createChild()` 挙動を活用するため、base が一意であることが重要（test 間で defaults を共有）
- jexer-reserve 実装をそのままコピーする方針に基づく

並列実行時の汚染懸念は vitest の file 単位 worker 分離 (`pool: 'forks' | 'threads'`) を前提に許容する。

### 6.2 `app.request` のベース URL 固定

`input` が path 文字列のとき内部で `new URL(input, 'http://localhost')` を使う。利用者が absolute URL を期待するシナリオ（host/scheme で routing 分岐する controller）では `input` に Request 自体を渡してもらう。テスト用 ergonomic API としては localhost 固定で実害なし（hono と同じ）。

### 6.3 `toWorker()` 削除の破壊的変更

Phase 2 (1) で公開した `HttpApp.toWorker()` は破壊的に削除する。koya v0 段階で外部利用者なし、影響範囲は同 repo 内 (`examples/hello`) のみ。後方互換 shim は提供しない。

---

## 7. テスト戦略

### 7.1 `@koya/core` HttpApp 改修

既存 `packages/core/src/http/app.test.ts` の `worker.fetch(...)` 呼び出しを `app.fetch(...)` に置換した上で、`request()` の挙動 4 ケースを追加:

| # | ケース | 期待 |
|---|---|---|
| 1 | `app.request('/hello/koya')` (path-only, GET) | controller が呼ばれて 200 返る |
| 2 | `app.request('/echo/', { method: 'POST', headers: {...}, body: JSON.stringify(...) })` | controller の `validated()` で body が読める |
| 3 | `app.request(new Request('https://x/hello/koya'))` で raw Request | controller が呼ばれて 200 返る |
| 4 | `app.request(new Request(...), { method: 'POST' })` で `init` を渡す | `init` は無視され、Request の method が優先される |

既存 6 ケース (`createHttpApp().toWorker()` describe + error paths describe) は `app.fetch(req)` を使う形に追従するだけ。テスト logic 自体は変えない。

### 7.2 `@koya/testing` `createTestContainer`

test util 自体に対するテストは本 phase では追加しない（test-of-test は YAGNI）。実装が jexer-reserve の動作実績ある 1:1 コピーである点で代替する。

### 7.3 既存テストの追従

- `packages/testing/src/test-app.test.ts` を削除（test-app.ts 削除に伴う）
- `examples/hello` の e2e テストで `toWorker()` を使っているケースは `app.fetch` に置換
- `packages/core/src/internal/route-builder.test.ts` 等で `createHttpApp(...).toWorker().fetch(...)` を直接呼んでいる箇所があれば `createHttpApp(...).fetch(...)` に簡略化（任意）

---

## 8. スコープ

### 8.1 本 phase に含めるもの

- `@koya/core` `HttpApp` shape 変更（`toWorker()` 削除 / `fetch` + `request` 追加）
- `@koya/testing` `createTestContainer` 新設（jexer-reserve 実装 1:1 コピー）
- `@koya/testing` `createTestApp` / `test-app.ts` / `test-app.test.ts` 削除
- 既存 `toWorker()` 利用箇所の `app.fetch` 置換（同 repo 内）

### 8.2 別 phase に送るもの

| 項目 | 送り先 |
|---|---|
| type-level public API shape test (Phase 2 (3) reviewer Low) | 別途検討 |
| request mocking / time-clock mock / in-memory database / HTTP fixture | Phase 2 (5) 以降 |
| `app.request` への env / ExecutionContext signature 拡張 | adapter で吸収する設計のため別途検討 |
| Lifecycle hook (`onStart` 等) | Phase 2 (5) |

### 8.3 当面採用しないもの

- `createTestContainer` の non-class Token<T> 用 helper（YAGNI、必要になれば追加）
- test util 自体に対する test-of-test
- README / docs への利用例の追記

---

## 9. リスク

| # | リスク | 緩和 |
|---|---|---|
| R1 | `toWorker()` 削除は破壊的変更 | v0 段階・外部利用者なし、影響範囲は同 repo 内のみ。後方互換 shim 提供しない |
| R2 | `let baseContainer` は CLAUDE.md「NEVER global state」と緊張 | test util ファイル限定 cache、runtime 非露出。spec §6.1 で例外として明記 |
| R3 | `app.request` path-only 時のベース URL 固定 (`http://localhost`) | hono と同じ慣例。利用者が host/scheme 依存テストを書きたければ Request 自体を渡せる |
| R4 | `createTestContainer` の global cache がテスト並列実行時に汚染される可能性 | vitest の file 単位 worker 分離前提（`pool: 'forks' | 'threads'`）で実害ない範囲 |
| R5 | jexer-reserve 実装の 1:1 コピーは koya framework 用途では default bind が空になる | プロジェクト側で必要なら fork する想定（本 phase では README 案内も追加しない） |
