# koya Phase 2 (4): Testing utility + HttpApp 整理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@koya/core` の `HttpApp` を hono 互換の `fetch` / `request` 構造に整理し、`@koya/testing` には needle-di の child container パターンによる `createTestContainer` を新設する。テスト専用 API を作らず、HTTP integration は `createHttpApp()` の戻り値を直接使う形に統一する。

**Architecture:** `HttpApp` から `toWorker()` と `WorkerHandler` 型を削除し、`fetch(req)` と `request(input, init?)` を直接公開する (hono の `app.fetch` / `app.request` と同じ二層構造)。`@koya/testing` は jexer-reserve の `test-container.ts` を 1:1 でコピーした `createTestContainer` を新設し、既存の `createTestApp` HTTP shim は削除する。`examples/hello` の `toWorker()` 利用箇所は `app.fetch` / `export default app` に追従する。

**Tech Stack:** TypeScript 6.0 / hono 4.12.16 / @needle-di/core 1.1.2 / valibot 1.3.1 / vitest 4.x

**Spec:** `docs/superpowers/specs/2026-05-03-koya-phase2-4-testing-utility-design.md`

---

## File Structure

| Path | 役割 | 変更 |
|---|---|---|
| `packages/core/src/http/app.ts` | HttpApp factory + 型定義 | 改修: `toWorker()` / `WorkerHandler` 削除、`fetch` + `request` 追加 |
| `packages/core/src/http/app.test.ts` | HttpApp の vitest テスト | 改修: 既存 6 ケースを `app.fetch` 利用に置換 + `request()` 4 ケース追加 |
| `packages/core/src/index.ts` | `@koya/core` barrel export | 改修: `WorkerHandler` 型 export を削除 |
| `packages/testing/src/test-app.ts` | 旧 HTTP shim | 削除 |
| `packages/testing/src/test-app.test.ts` | 旧 HTTP shim test | 削除 |
| `packages/testing/src/test-container.ts` | DI mock util (jexer-reserve 1:1 コピー) | 新規 |
| `packages/testing/src/index.ts` | `@koya/testing` barrel export | 改修: `createTestApp` を `createTestContainer` に置換 |
| `packages/testing/package.json` | testing package manifest | 改修: `peerDependencies` に `@needle-di/core` 追加 |
| `examples/hello/src/main.ts` | Workers entry | 改修: `app.toWorker();` → `export default app;` |
| `examples/hello/src/test/hello.e2e-spec.ts` | hc client e2e | 改修: `app.toWorker().fetch(...)` → `app.fetch(...)` 直接利用 |

---

## Task ordering and dependencies

```
Task 1 (testing 旧 shim 削除)              ← independent
Task 2 (HttpApp shape 変更 + examples 追従) ← Task 1 後（中間状態を壊さないため）
Task 3 (createTestContainer 追加)          ← Task 1 後 (Task 2 と並列可)
```

中間状態 (各 commit 直後) でビルド・型・テストすべてが通ることを保証する順序。

---

## Critical implementation references

実装中に参照すべき既存コード:

- `/workspaces/github.com/9wick/jexer-reserve/packages/core/src/test/test-container.ts` — Task 3 でコピー元として使うファイル（このリポジトリ外）。プロジェクト固有の import (`LineNotifierConfigToken` / `LoggerToken`) と `getBaseContainer()` 内の bind 行のみ削る
- `packages/core/src/http/app.ts:8-31` — 現状の `HttpApp` / `CreateHttpAppOptions` / `WorkerHandler` 定義、Task 2 で書き換え対象
- `packages/core/src/http/app.test.ts:38-125` — 既存テストの toWorker 利用箇所、Task 2 で `app.fetch` 直接利用に置換
- `packages/core/src/index.ts:1-2` — `WorkerHandler` の barrel export 行、Task 2 で除去
- `packages/testing/package.json` — `peerDependencies` に `@needle-di/core` を追加（Task 3）
- `examples/hello/src/main.ts:3` — `app.toWorker();` の置換対象（Task 2）
- `examples/hello/src/test/hello.e2e-spec.ts:8-11` — `worker.fetch(...)` を `app.fetch(...)` に変える（Task 2）

---

### Task 1: `@koya/testing` 旧 `createTestApp` shim 削除

**Goal:** `@koya/testing` から旧 HTTP shim (`createTestApp` / `TestApp`) と関連テストを削除し、barrel export を空にする。Task 2 で `toWorker()` を削除する前段として、testing 側が `toWorker` に依存しない状態を作る。

**Files:**
- Delete: `packages/testing/src/test-app.ts`
- Delete: `packages/testing/src/test-app.test.ts`
- Modify: `packages/testing/src/index.ts`

- [ ] **Step 1: Delete `packages/testing/src/test-app.ts`**

```bash
rm packages/testing/src/test-app.ts
```

- [ ] **Step 2: Delete `packages/testing/src/test-app.test.ts`**

```bash
rm packages/testing/src/test-app.test.ts
```

- [ ] **Step 3: Replace `packages/testing/src/index.ts` with empty barrel**

`packages/testing/src/index.ts` を以下に置き換え:

```ts
// Phase 2 (4): createTestContainer は Task 3 で追加される。
export {};
```

注: `export {};` は ESM module として valid な空 barrel。tsdown / tsc は warning なくビルドできる。

- [ ] **Step 4: Run @koya/testing typecheck to confirm no broken references**

Run: `pnpm --filter @koya/testing typecheck`
Expected: PASS（test-app の参照が全て消えているはず）。

- [ ] **Step 5: Run @koya/testing test to confirm clean state**

Run: `pnpm --filter @koya/testing test`
Expected: PASS with "no test files found" or similar (test ファイルが 0 件になる)。

- [ ] **Step 6: Run @koya/core test to confirm no cross-package breakage**

Run: `pnpm --filter @koya/core test`
Expected: PASS (createTestApp は @koya/core から参照されていないため影響ないはず)。

- [ ] **Step 7: Commit**

```bash
git add packages/testing/src/index.ts
git rm packages/testing/src/test-app.ts packages/testing/src/test-app.test.ts
git commit -m "refactor(testing): remove createTestApp HTTP shim"
```

---

### Task 2: `@koya/core` `HttpApp` shape 変更 + `examples/hello` 追従

**Goal:** `HttpApp` から `toWorker()` / `WorkerHandler` を削除し、hono 互換の `fetch(req)` と `request(input, init?)` を直接公開する。同 commit 内で `examples/hello` の `toWorker()` 利用箇所も `app.fetch` / `export default app` に追従させる（中間状態でビルドが壊れないように）。

**Files:**
- Modify: `packages/core/src/http/app.ts`
- Modify: `packages/core/src/http/app.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `examples/hello/src/main.ts`
- Modify: `examples/hello/src/test/hello.e2e-spec.ts`

- [ ] **Step 1: Rewrite `packages/core/src/http/app.test.ts` for new API + add request() tests**

`packages/core/src/http/app.test.ts` を以下に書き換え（既存 6 ケースの `worker.fetch` を `app.fetch` に置換 + `request()` 4 ケース追加）:

```ts
import { injectable } from '@needle-di/core';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { Controller } from '../decorators/controller';
import { Get, Post } from '../decorators/http-method';
import { inject } from '../primitives/inject';
import { pathParam } from '../primitives/path-param';
import { validated } from '../primitives/validated';

import { createHttpApp } from './app';

@injectable()
class Greeter {
  greet(name: string) {
    return `hello, ${name}`;
  }
}

@Controller('/hello')
class HelloController {
  constructor(private greeter = inject(Greeter)) {}

  @Get('/:name')
  greet() {
    return { message: this.greeter.greet(pathParam('name')) };
  }
}

@Controller('/echo')
class EchoController {
  @Post('/')
  create() {
    return validated(v.object({ msg: v.string() }));
  }
}

const buildApp = () => createHttpApp({ controllers: [HelloController, EchoController] });

describe('createHttpApp() — fetch', () => {
  it('serves a constructor-injected GET endpoint with pathParam', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('https://example.com/hello/koya'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, koya' });
  });

  it('parses JSON body via validated()', async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request('https://example.com/echo/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msg: 'ok' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ msg: 'ok' });
  });

  it('mounts multiple controllers under different base paths', async () => {
    const app = buildApp();
    const a = await app.fetch(new Request('https://example.com/hello/x'));
    const b = await app.fetch(
      new Request('https://example.com/echo/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msg: 'y' }),
      }),
    );
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  it('throws at createHttpApp() construction when a controller is missing @Controller', () => {
    class NoDecorator {
      @Get('/')
      list() {}
    }
    new NoDecorator();
    expect(() => createHttpApp({ controllers: [NoDecorator] })).toThrow(
      /missing @Controller/,
    );
  });
});

describe('createHttpApp() — request', () => {
  it('accepts a path string with no init (defaults to GET)', async () => {
    const app = buildApp();
    const res = await app.request('/hello/koya');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, koya' });
  });

  it('accepts a path string with init for POST + JSON body', async () => {
    const app = buildApp();
    const res = await app.request('/echo/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ msg: 'ok' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ msg: 'ok' });
  });

  it('accepts a raw Request instance', async () => {
    const app = buildApp();
    const res = await app.request(new Request('https://x/hello/koya'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, koya' });
  });

  it('ignores init when input is a Request (Request takes precedence)', async () => {
    const app = buildApp();
    // Request の method は GET、init で POST を指定しても Request 側が優先される
    const res = await app.request(
      new Request('https://x/hello/koya'),
      { method: 'POST' },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, koya' });
  });
});

describe('error paths', () => {
  it('returns 400 when validated() rejects the body', async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request('https://example.com/echo/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msg: 42 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for malformed JSON body (validated() sees undefined)', async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request('https://example.com/echo/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 when pathParam() asks for a missing parameter', async () => {
    @Controller('/x')
    class BrokenController {
      @Get('/')
      run() {
        return { v: pathParam('id') };
      }
    }
    const app = createHttpApp({ controllers: [BrokenController] });
    const res = await app.fetch(new Request('https://example.com/x/'));
    expect(res.status).toBe(500);
  });
});
```

注 1: 既存テストでは `expect(() => createHttpApp({ controllers: [NoDecorator] }).toWorker()).toThrow(...)` だったが、新仕様では `toWorker()` がないため throw タイミングが変わる。現状 `createHttpApp` は `buildRoutes` を constructor 内で呼ぶ (`packages/core/src/http/app.ts:25`) ので `createHttpApp({...})` 自体が throw する。テストを `expect(() => createHttpApp({ controllers: [NoDecorator] })).toThrow(...)` に修正済み。

注 2: `request()` Test #4 の挙動 — Request 自体が渡された場合 `init` 引数は無視される（spec §4.1 / §6.2）。これは Web 標準 `new Request(input, init)` の挙動と一致：input が Request の場合、init は Request の field を一部上書きできるが、実装上は input の Request をそのまま fetch に渡すため init は完全に無視される。

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @koya/core test -- app.test`
Expected: FAIL — `app.fetch is not a function` / `app.request is not a function` / `Property 'fetch' does not exist on type 'HttpApp'` 等。

- [ ] **Step 3: Rewrite `packages/core/src/http/app.ts`**

`packages/core/src/http/app.ts` を以下に置き換え:

```ts
import { Hono } from 'hono';

import { createContainer } from '../internal/container';
import { buildRoutes } from '../internal/route-builder';

type ControllerClass = new (...args: never[]) => object;

export type CreateHttpAppOptions = {
  readonly controllers: readonly ControllerClass[];
};

export type HttpApp = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly request: (input: string | Request, init?: RequestInit) => Promise<Response>;
};

export const createHttpApp = (options: CreateHttpAppOptions): HttpApp => {
  const resolver = createContainer();
  // strict:false で `/echo` と `/echo/` を同一視する。joinPath が末尾スラッシュを正規化するため、
  // 利用者が `@Post('/')` と書いた場合でも `/echo/` リクエストにマッチさせる必要がある。
  const hono = new Hono({ strict: false });
  buildRoutes(hono, options.controllers, resolver);

  const fetch = (req: Request): Promise<Response> => Promise.resolve(hono.fetch(req));
  const request = (input: string | Request, init?: RequestInit): Promise<Response> => {
    // path 文字列の場合は localhost ベースで Request を組み立てる。テスト用 ergonomic API なので
    // host/scheme は意味を持たない (hono `app.request` と同じ慣例)。
    const req =
      typeof input === 'string' ? new Request(new URL(input, 'http://localhost'), init) : input;
    return fetch(req);
  };

  return { fetch, request };
};
```

注: `WorkerHandler` 型と `toWorker()` メソッドは削除。

- [ ] **Step 4: Modify `packages/core/src/index.ts` to drop WorkerHandler export**

`packages/core/src/index.ts` の冒頭 2 行を以下に置き換え:

```ts
export { createHttpApp } from './http/app';
export type { CreateHttpAppOptions, HttpApp } from './http/app';
```

`WorkerHandler` を削除した以外は変更なし。

- [ ] **Step 5: Run tests to confirm they pass**

Run: `pnpm --filter @koya/core test -- app.test`
Expected: PASS（既存 6 ケース + request 4 ケース = 10 ケース）。

- [ ] **Step 6: Modify `examples/hello/src/main.ts`**

`examples/hello/src/main.ts` を以下に置き換え:

```ts
import { app } from './app';

export default app;
// app.fetch が Workers / Bun / Deno runtime に拾われる
```

注: 既存の `app.toWorker(); // serveNode({app, port});` を `export default app;` に置換。

- [ ] **Step 7: Modify `examples/hello/src/test/hello.e2e-spec.ts`**

`examples/hello/src/test/hello.e2e-spec.ts` を以下に置き換え:

```ts
import { hc } from 'hono/client';
import { describe, expect, it } from 'vitest';

import { app } from '../app';
import type { AppType } from '../../generated/app.gen';

describe('/hello', () => {
  const client = hc<AppType>('https://example.local', {
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      app.fetch(new Request(input, init)),
  });

  it('GET narrows response and returns greeting', async () => {
    // GET has no validated() arg, so AppType narrows status to 200 only — no
    // 400 union branch. `await res.json()` returns GreetResponse directly.
    const res = await client.hello[':name'].$get({ param: { name: 'koya' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ message: 'hello, koya' });
  });

  it('POST returns 201 with validated body', async () => {
    const res = await client.hello.$post({ json: { name: 'koya', excited: true } });
    expect(res.status).toBe(201);
    if (res.status === 201) {
      const body = await res.json();
      expect(body).toMatchObject({ message: 'hello, koya!!!' });
    }
  });

  it('POST returns 400 ValidationErrorBody on invalid payload', async () => {
    const res = await client.hello.$post({
      // @ts-expect-error — purposely invalid payload to trigger validation error
      json: { name: 123 },
    });
    expect(res.status).toBe(400);
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).toBe('validation_failed');
      expect(Array.isArray(body.issues)).toBe(true);
    }
  });
});
```

注: `const worker = app.toWorker();` を削除し、`hc` の `fetch` callback で `app.fetch(new Request(input, init))` を直接呼ぶ形に変更。

- [ ] **Step 8: Run @koya/core typecheck + test**

Run: `pnpm --filter @koya/core typecheck && pnpm --filter @koya/core test`
Expected: PASS。

- [ ] **Step 9: Run examples/hello typecheck + test**

Run: `pnpm --filter examples-hello typecheck && pnpm --filter examples-hello test`
Expected: PASS。

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/http/app.ts \
        packages/core/src/http/app.test.ts \
        packages/core/src/index.ts \
        examples/hello/src/main.ts \
        examples/hello/src/test/hello.e2e-spec.ts
git commit -m "feat(core): replace HttpApp.toWorker with fetch and request"
```

---

### Task 3: `@koya/testing` `createTestContainer` 追加

**Goal:** jexer-reserve の `test-container.ts` を 1:1 でコピー（プロジェクト固有 import / bind 行のみ削除）して `@koya/testing` に新設する。barrel export と peerDeps を更新する。

**Files:**
- Create: `packages/testing/src/test-container.ts`
- Modify: `packages/testing/src/index.ts`
- Modify: `packages/testing/package.json`

- [ ] **Step 1: Create `packages/testing/src/test-container.ts`**

`packages/testing/src/test-container.ts` を新規作成（jexer-reserve の `packages/core/src/test/test-container.ts` を 1:1 コピーから、プロジェクト固有 import 2 行と `getBaseContainer()` 内の bind 行を削除したもの）:

```ts
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

  return baseContainer;
};
```

注 1: jexer-reserve 原本の `LineNotifierConfigToken` / `LoggerToken` import 行と対応する `baseContainer.bind({...})` 行は削除。`getBaseContainer()` 内のコメント「本来は利用側で必要なものをdummy inject する」は jexer-reserve から残す（spec §4.2 で 1:1 コピー方針として確定済み）。

注 2: `any[]` が使われているが、これは jexer-reserve のオリジナル型シグネチャ。tuple 型推論のため `unknown[]` では動かない。`@9wick/eslint-plugin-strict-type-rules` の strictest preset で `no-explicit-any` ルールが入っていれば、`// eslint-disable-next-line @typescript-eslint/no-explicit-any` を `type CreateContainerParams = ...` の直前に付与する必要が生じる可能性あり。Step 5 の typecheck/lint で確認し、警告が出れば disable comment を追加する。

- [ ] **Step 2: Replace `packages/testing/src/index.ts` to export createTestContainer**

`packages/testing/src/index.ts` を以下に置き換え:

```ts
export { createTestContainer } from './test-container';
```

- [ ] **Step 3: Modify `packages/testing/package.json` peerDependencies**

`packages/testing/package.json` の `peerDependencies` セクションを以下に置き換え:

```json
  "peerDependencies": {
    "@koya/core": "workspace:*",
    "@needle-di/core": "1.1.2",
    "vitest": ">=4 <5"
  },
```

注: `@needle-di/core` を追加（`Container` / `Token` を直接 import するため）。version は `@koya/core` の `dependencies."@needle-di/core"` と一致させる（exact pin）。

- [ ] **Step 4: Run pnpm install to refresh lockfile**

Run: `pnpm install`
Expected: lockfile が更新され、`@koya/testing` の peerDeps に `@needle-di/core` が反映される。

- [ ] **Step 5: Run @koya/testing typecheck**

Run: `pnpm --filter @koya/testing typecheck`
Expected: PASS。`any[]` で lint エラーが出る場合は Step 1 の注 2 に従って eslint-disable comment を追加。

- [ ] **Step 6: Run @koya/testing build**

Run: `pnpm --filter @koya/testing build`
Expected: PASS。`packages/testing/dist/index.js` / `index.d.ts` に `createTestContainer` が含まれることを確認:

```bash
grep -E 'createTestContainer' packages/testing/dist/index.d.ts
```

Expected: `export declare const createTestContainer: ...` を含む行が出力される。

- [ ] **Step 7: Commit**

```bash
git add packages/testing/src/test-container.ts \
        packages/testing/src/index.ts \
        packages/testing/package.json \
        pnpm-lock.yaml
git commit -m "feat(testing): add createTestContainer DI mock util"
```

---

## Final verification

すべての task 完了後に実行:

- [ ] **Whole-workspace typecheck**

Run: `pnpm -w typecheck`
Expected: 全 package で型エラーなし。

- [ ] **Whole-workspace test**

Run: `pnpm -w test`
Expected: 全 package で test PASS（@koya/core / @koya/testing / @koya/contract / examples/hello を含む）。

- [ ] **Whole-workspace build**

Run: `pnpm -w build`
Expected: 全 package で build 成功。

- [ ] **Whole-workspace lint**

Run: `pnpm -w lint`
Expected: biome / eslint で違反なし。

- [ ] **Manual spot-check: removed exports**

```bash
grep -rn "toWorker\|WorkerHandler\|createTestApp\|TestApp" packages examples 2>/dev/null | grep -v node_modules | grep -v dist
```

Expected: 出力なし（すべての参照が消えている）。

- [ ] **Manual spot-check: barrel export shape**

```bash
grep -E "createTestContainer" packages/testing/dist/index.d.ts
grep -E "fetch|request|HttpApp|WorkerHandler" packages/core/dist/index.d.ts
```

Expected:
- `packages/testing/dist/index.d.ts` に `createTestContainer` の export がある
- `packages/core/dist/index.d.ts` に `HttpApp` の `fetch` / `request` が含まれ、`WorkerHandler` が含まれない

- [ ] **Manual smoke test: examples/hello**

Run: `pnpm --filter examples-hello test`
Expected: e2e test 3 ケース PASS（hc client が `app.fetch` 経由で routing される）。

---

## Self-review notes

- **spec coverage**: spec §4.1 (HttpApp) → Task 2 / spec §4.2 (createTestContainer) → Task 3 / spec §4.3 (削除する API) → Task 1 + Task 2 / spec §5 (file 変更一覧) → Task 1〜3 / spec §7 (test 戦略) → Task 2 Step 1
- **commit 順序による中間状態の安全性**: Task 1 (testing shim 削除) → Task 2 (HttpApp shape 変更 + examples 追従) → Task 3 (createTestContainer 追加)。各 commit 直後で `pnpm -w typecheck` / `pnpm -w test` が通るように設計
- **TDD**: Task 2 で新規 `request()` 4 ケースを先に書いて FAIL を確認 → 実装 → PASS の順を守る。既存 6 ケースの toWorker → fetch 置換は構造的に同等の refactoring なので、同 step 内で test と実装を同時更新（古い API のまま test を走らせる時間枠を作らない）
- **YAGNI**: spec §8.3 で除外された type-level public API shape test、test-of-test、README は本 plan で扱わない
- **既知リスク**:
  - **R1 (toWorker 破壊的変更)**: examples/hello の追従を Task 2 同 commit で行うことで repo 内整合性を保つ。外部利用者は v0 段階で存在しない前提（spec §6.3）
  - **R2 (let baseContainer の global state)**: jexer-reserve 1:1 コピーとして許容（spec §6.1）。CLAUDE.md「NEVER global state」原則の test util 限定例外として spec で記録済み
  - **`any[]` lint 違反の可能性**: Task 3 Step 1 注 2 で eslint-disable 対応を予告。発生時のみ disable コメント追加で対応
- **Scope-out 確認** (本 plan で扱わない):
  - type-level public API shape test (Phase 2 (3) reviewer Low)
  - request mocking / time-clock mock / in-memory database / HTTP fixture
  - `app.request` への env / ExecutionContext signature 拡張
  - Lifecycle hook (`onStart` 等) — Phase 2 (5)
  - test-of-test (createTestContainer 自体のテスト)
  - README / docs への利用例追記
