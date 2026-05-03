# koya Phase 2 (1) API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `@koya/core` Phase 2 (1) public API (HTTP App + routing + DI + 3 入力 primitives) と、`@koya/testing` の最小 HTTP integration invoke API。Hono を内部実装として完全隠蔽し、TypeScript legacy decorator (`experimentalDecorators: true` / reflect-metadata なし) と引数デフォルト値で codegen を排除する。

**Architecture:** `createHttpApp({ controllers })` が `@needle-di/core` Container を opaque な `ResolverHandle` 経由で所有し、`@Controller` / `@Get` 等の class/method decorator は WeakMap ベース metadata storage に登録する。HTTP request 時に `toWorker()` が返す Workers handler が AsyncLocalStorage で Entry context を `run()` 内に流し、Hono の internal route が controller method を引数なしで呼ぶ。引数デフォルト値の primitive (`inject` / `validated` / `pathParam`) が ALS context から値を取得する。**明示的な provider 登録は持たない**。Service / Repository / Adapter は `inject(X)` の auto-bind で解決する (spec §4.10)。class は Entry / Provider (DI 登録単位) のみに限定し、internal は関数 + readonly データ。

**Tech Stack:** TypeScript 6.0.2 / hono 4.12.16 / @needle-di/core 1.1.2 / valibot 1.3.1 / vitest 4.1.5 / tsdown 0.21.10 / pnpm workspace + Nx 21.6.10

**Spec:** [`docs/superpowers/specs/2026-05-02-koya-phase2-api-design.md`](../specs/2026-05-02-koya-phase2-api-design.md)

**Review notes (2026-05-02):** plan-review skill (ts-reviewer / codex-reviewer / tdd-reviewer) を反映済。主要修正:
- `inject` は `@needle-di/core` の re-export (constructor 引数 default 専用)。spec §10 #10 / §11 #6
- `Application` は opaque 型 (`http()` メソッドのみ公開)、`Container` を public 型から削除
- needle-di 実 API に整合: `injectable()` は 1 引数、`providers: readonly Provider<unknown>[]`
- `WorkerHandler.fetch` を `Response | Promise<Response>` 受容形に
- Task 9 から Hono 直接 import を排除、buildRoutes integration は Task 10 で集約
- CI grep を再帰 + 真陽性検証 + `@needle-di/core.Container` も対象に

**Spike findings (2026-05-02 / spec §3 §9.1 §10 #11 反映済):**
- Stage 3 decorator 構文は koya の toolchain (vite 8 / tsdown / rolldown / oxc) が transpile せず Node v22/v24 がパース不可。**legacy decorator (`experimentalDecorators: true`) を採用** (reflect-metadata は引き続き要求しない、`@needle-di/core` が reflect-metadata 非依存)。
- `tsdown@0.9.3` では oxc の `__decorate` helper が external 参照のまま残り `ERR_MODULE_NOT_FOUND`。**`tsdown@0.21.10` 以降にバンプ済**。
- `packages/core/tsconfig.json` に `experimentalDecorators: true` + `erasableSyntaxOnly: false` を追加済 (spike 段階で apply)。
- 影響を受ける Plan task: Task 3 / Task 4 の decorator signature を **Stage 3 形式 → legacy 形式** に変更 (詳細は各 task 内)。
- legacy 形式の挙動上、method decorator は **class declaration 時に発火** (Stage 3 の `addInitializer` per-instance モデルと違い、`new C()` 不要で metadata 確定)。Task 4 / Task 9 の test 内 `new C()` は不要に。

**Design revision (2026-05-02 後半 / spec §4.10 / §10 #12 #13 / §11 #7 #8 反映済):**
- Task 8-15 で実装した `createApp({ providers }).http({ controllers })` の 2 段階形は、controllers 二重指定 + provider 登録の責務超過 (spec §4.10) を生むため、`createHttpApp({ controllers })` 単一形に統一する。
- 後続 phase で予定していた `useFactory` / `useValue` / `useClass` / scope 制御の Provider DSL も廃止。外部境界は adapter class が責務として内包する (spec §4.10)。
- 該当する API 切替は **Task 16** にまとめて記載。Task 0-15 はコミット履歴と整合した実装記録としてそのまま残す。

---

## File Structure

`packages/core/src/` (Task 16 改訂後の最終形):
- `http/app.ts` — `createHttpApp({ controllers })` factory + `HttpApp` / `WorkerHandler` 型 (Task 16 で `http/runtime.ts` を rename)
- `decorators/controller.ts` — `@Controller(path)` class decorator
- `decorators/http-method.ts` — `@Get` / `@Post` / `@Put` / `@Patch` / `@Delete` method decorators
- `primitives/inject.ts` — DI コンテナ解決
- `primitives/validated.ts` — valibot による request body validation
- `primitives/path-param.ts` — URL path parameter 取得
- `http/error-handler.ts` — validation error / generic error → Response 変換
- `internal/entry-context.ts` — AsyncLocalStorage Entry context
- `internal/container.ts` — `ResolverHandle` opaque 型 + `createContainer(controllers)` (Container を public d.ts から完全隠蔽)
- `internal/metadata.ts` — WeakMap decorator metadata storage
- `internal/route-builder.ts` — controller class → Hono route 構築 (内部)
- `index.ts` — 公開 API barrel
- `workers.ts` / `lambda.ts` — Phase 1 sub-entry のまま (本 phase 触らない)
- ~~`application.ts`~~ — Task 16 で削除 (Application 抽象廃止、createHttpApp に統合)

`packages/testing/src/`:
- `test-app.ts` — `createTestApp(app)` + `request(method, path, body?)`
- `version.ts` — Phase 1 dogfood の名残。Task 13 で削除
- `index.ts` — barrel

`.github/workflows/ci.yml`:
- Task 14 で Hono 型隠蔽 grep check step 追加

`examples/hello/src/main.ts`:
- Task 15 で Phase 2 API リライト

---

## Task 0: ライブラリ API spike

**Files:**
- Create: `packages/core/src/internal/__spike__/needle-di-spike.test.ts` (検証後削除)

`@needle-di/core@1.1.2` と `valibot@1.3.1` の Stage 3 互換性・型挙動を実コードで確認する。**この spike が破綻すると plan 全体の前提が崩れる**ため最初に実施。

- [ ] **Step 1: needle-di の Stage 3 互換性と decorator 合成を検証**

```ts
// packages/core/src/internal/__spike__/needle-di-spike.test.ts
import { Container, inject, injectable } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

describe('needle-di Stage 3 spike', () => {
  it('injectable() takes a single class argument and returns the class', () => {
    class A {}
    const result = injectable()(A);
    expect(result === A || result === undefined).toBe(true);
  });

  it('constructor default with inject() resolves through container.get', () => {
    @injectable()
    class Dep {
      ping() {
        return 'pong';
      }
    }
    @injectable()
    class Use {
      constructor(public dep = inject(Dep)) {}
    }
    const c = new Container();
    c.bind(Use);
    c.bind(Dep);
    expect(c.get(Use).dep.ping()).toBe('pong');
  });

  it('container.bind accepts a class without explicit @injectable() (or requires it)', () => {
    class Plain {}
    const c = new Container();
    expect(() => c.bind(Plain)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the spike**

Run: `pnpm --filter @koya/core test src/internal/__spike__/needle-di-spike`
Expected: all 3 tests PASS. Outcomes:

- If `injectable()(target, context)` 2-arg call fails type-check → confirm: needle-di expects 1-arg only. Plan Task 3 already aligned with 1-arg form.
- If `c.bind(Plain)` throws → record finding. Plan must require `@injectable()` on Provider classes (spec §4.7 needs minor amendment) or `createApp` must auto-apply `injectable()` before bind.
- If `Token` import is unavailable, swap to `Provider<unknown>` (already aligned in plan).

- [ ] **Step 3: barrel rule check on a probe `index.ts`**

Run:

```bash
cat > /tmp/barrel-probe.ts <<'EOF'
export { createApp } from './application';
export type { Application } from './application';
EOF
pnpm exec eslint /tmp/barrel-probe.ts --rule '@9wick/strict-type-rules/barrel:error' --no-eslintrc 2>&1 || true
rm /tmp/barrel-probe.ts
```

Expected: no barrel rule violation, or note specific format requirement (value/type separation). Apply finding to Task 12.

- [ ] **Step 4: Record findings + delete spike**

Append findings to plan as a comment in Task 0 or remove the spike file:

```bash
rm -rf packages/core/src/internal/__spike__
```

Findings:
- needle-di Stage 3: ✅ / ❌ / partial
- bind() without @injectable: ✅ allowed / ❌ requires explicit @injectable()
- barrel rule: type/value mixed allowed / separated required

If any finding contradicts later tasks, update plan inline before continuing.

- [ ] **Step 5: Commit (only if findings file is added)**

If a `docs/superpowers/plans/2026-05-02-koya-phase2-spike-findings.md` is created, commit it. Otherwise skip.

---

## Task 1: AsyncLocalStorage Entry context

**Files:**
- Create: `packages/core/src/internal/entry-context.ts`
- Test: `packages/core/src/internal/entry-context.test.ts`

すべての primitive (`inject` / `validated` / `pathParam`) が依存する基盤。Entry 実行中に `runInEntryContext()` で context を流し、`getEntryContext()` で取得する。

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/internal/entry-context.test.ts
import { describe, expect, it } from 'vitest';

import { getEntryContext, runInEntryContext, type EntryContext } from './entry-context';

describe('entry-context', () => {
  it('returns the running context inside runInEntryContext', () => {
    const ctx: EntryContext = {
      input: { body: { hello: 'world' }, pathParams: {} },
      container: {} as never,
    };
    const got = runInEntryContext(ctx, () => getEntryContext());
    expect(got).toBe(ctx);
  });

  it('throws when called outside runInEntryContext', () => {
    expect(() => getEntryContext()).toThrow(/outside entry execution/);
  });

  it('isolates concurrent contexts', async () => {
    const ctxA: EntryContext = { input: { body: 'A', pathParams: {} }, container: {} as never };
    const ctxB: EntryContext = { input: { body: 'B', pathParams: {} }, container: {} as never };
    const [a, b] = await Promise.all([
      runInEntryContext(ctxA, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return getEntryContext().input.body;
      }),
      runInEntryContext(ctxB, async () => getEntryContext().input.body),
    ]);
    expect(a).toBe('A');
    expect(b).toBe('B');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @koya/core test src/internal/entry-context`
Expected: FAIL with "Cannot find module './entry-context'"

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/internal/entry-context.ts
import { AsyncLocalStorage } from 'node:async_hooks';

import type { Container } from '@needle-di/core';

export type EntryInput = {
  readonly body: unknown;
  readonly pathParams: Readonly<Record<string, string>>;
};

export type EntryContext = {
  readonly input: EntryInput;
  readonly container: Container;
};

const storage = new AsyncLocalStorage<EntryContext>();

export const runInEntryContext = <T>(ctx: EntryContext, fn: () => T): T =>
  storage.run(ctx, fn);

export const getEntryContext = (): EntryContext => {
  const ctx = storage.getStore();
  if (!ctx) throw new Error('koya: primitive called outside entry execution');
  return ctx;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @koya/core test src/internal/entry-context`
Expected: PASS (3 tests)

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/internal/entry-context.ts packages/core/src/internal/entry-context.test.ts
git commit -m "feat(core): add AsyncLocalStorage entry context"
```

---

## Task 2: Decorator metadata storage (WeakMap)

**Files:**
- Create: `packages/core/src/internal/metadata.ts`
- Test: `packages/core/src/internal/metadata.test.ts`

legacy decorator が class/method に付けた情報を class 単位で集約する。`@Controller` が path を、`@Get` 等が HTTP method/path/handler を登録する。class 値そのものを WeakMap key にする。`appendRouteMetadata` は重複登録を防ぐ dedup を内蔵 (legacy decorator は通常 1 回だけ発火するが、ユーザーが手動で同じ route を 2 度登録しても安全にする)。

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/internal/metadata.test.ts
import { describe, expect, it } from 'vitest';

import {
  appendRouteMetadata,
  getControllerMetadata,
  getRouteMetadata,
  setControllerMetadata,
} from './metadata';

describe('metadata', () => {
  class A {}
  class B {}

  it('stores controller metadata per class', () => {
    setControllerMetadata(A, { basePath: '/users' });
    setControllerMetadata(B, { basePath: '/posts' });
    expect(getControllerMetadata(A)).toEqual({ basePath: '/users' });
    expect(getControllerMetadata(B)).toEqual({ basePath: '/posts' });
  });

  it('returns undefined for unknown class', () => {
    class C {}
    expect(getControllerMetadata(C)).toBeUndefined();
  });

  it('appends route metadata in declaration order', () => {
    class D {}
    appendRouteMetadata(D, { method: 'GET', path: '/', methodName: 'list' });
    appendRouteMetadata(D, { method: 'POST', path: '/', methodName: 'create' });
    expect(getRouteMetadata(D)).toEqual([
      { method: 'GET', path: '/', methodName: 'list' },
      { method: 'POST', path: '/', methodName: 'create' },
    ]);
  });

  it('dedupes duplicate route metadata (safety net for repeated registrations)', () => {
    class E {}
    appendRouteMetadata(E, { method: 'GET', path: '/', methodName: 'list' });
    appendRouteMetadata(E, { method: 'GET', path: '/', methodName: 'list' });
    expect(getRouteMetadata(E)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @koya/core test src/internal/metadata`
Expected: FAIL with "Cannot find module './metadata'"

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/internal/metadata.ts
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ControllerMetadata = {
  readonly basePath: string;
};

export type RouteMetadata = {
  readonly method: HttpMethod;
  readonly path: string;
  readonly methodName: string | symbol;
};

const controllerStore = new WeakMap<object, ControllerMetadata>();
const routeStore = new WeakMap<object, RouteMetadata[]>();

export const setControllerMetadata = (cls: object, meta: ControllerMetadata): void => {
  controllerStore.set(cls, meta);
};

export const getControllerMetadata = (cls: object): ControllerMetadata | undefined =>
  controllerStore.get(cls);

export const appendRouteMetadata = (cls: object, meta: RouteMetadata): void => {
  const existing = routeStore.get(cls) ?? [];
  const exists = existing.some(
    (r) => r.method === meta.method && r.path === meta.path && r.methodName === meta.methodName,
  );
  if (exists) return;
  routeStore.set(cls, [...existing, meta]);
};

export const getRouteMetadata = (cls: object): readonly RouteMetadata[] =>
  routeStore.get(cls) ?? [];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @koya/core test src/internal/metadata`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/internal/metadata.ts packages/core/src/internal/metadata.test.ts
git commit -m "feat(core): add WeakMap-based decorator metadata storage"
```

---

## Task 3: `@Controller` class decorator

**Files:**
- Create: `packages/core/src/decorators/controller.ts`
- Test: `packages/core/src/decorators/controller.test.ts`

class に基底パスを登録する。内部で `@needle-di/core.injectable()` を合成し、ユーザーが `@injectable()` を別途付けなくても DI 解決可能にする (spec §4.7)。

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/decorators/controller.test.ts
import { Container } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { getControllerMetadata } from '../internal/metadata';
import { Controller } from './controller';

describe('@Controller', () => {
  it('registers base path on the class', () => {
    @Controller('/users')
    class UserController {}

    expect(getControllerMetadata(UserController)).toEqual({ basePath: '/users' });
  });

  it('preserves the class identity', () => {
    @Controller('/posts')
    class PostController {
      readonly tag = 'post' as const;
    }

    const instance = new PostController();
    expect(instance.tag).toBe('post');
  });

  it('makes the class resolvable from needle-di without explicit @injectable() (spec §4.7)', () => {
    @Controller('/x')
    class XController {
      hello() {
        return 'x';
      }
    }
    const container = new Container();
    container.bind(XController);
    expect(container.get(XController).hello()).toBe('x');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @koya/core test src/decorators/controller`
Expected: FAIL with "Cannot find module './controller'"

- [ ] **Step 3: Write minimal implementation**

**legacy decorator (`experimentalDecorators: true`) 形式**で書く (Spike findings 参照)。`@needle-di/core@1.1.2` の `injectable()` は legacy class decorator として `(target) => Class | void` を返す。class identity 維持のため `wrapped ?? target` を返す。

```ts
// packages/core/src/decorators/controller.ts
import { injectable } from '@needle-di/core';

import { setControllerMetadata } from '../internal/metadata';

// legacy class decorator: (target: Function) => Function | void
export const Controller = (basePath: string): ClassDecorator =>
  <T extends Function>(target: T): T => {
    setControllerMetadata(target, { basePath });
    const wrapped = (injectable() as (cls: T) => T | void)(target);
    return (wrapped ?? target) as T;
  };
```

`@9wick/eslint-plugin-strict-type-rules` の `ban-types` 等で `Function` 型が警告される可能性があれば、`<T extends abstract new (...args: never[]) => object>` でも書ける (legacy decorator の型は緩いので `Function` で素直に受ける方が定石)。lint で問題が出たらそこで narrow を検討。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @koya/core test src/decorators/controller`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/decorators/controller.ts packages/core/src/decorators/controller.test.ts
git commit -m "feat(core): add @Controller class decorator"
```

---

## Task 4: HTTP method decorators (`@Get` / `@Post` / `@Put` / `@Patch` / `@Delete`)

**Files:**
- Create: `packages/core/src/decorators/http-method.ts`
- Test: `packages/core/src/decorators/http-method.test.ts`

5 つの method decorator を 1 ファイルで提供。**legacy method decorator** (`experimentalDecorators: true`) で、class declaration 時に metadata を class の WeakMap に append する (`new C()` 不要)。static method は throw で拒否。

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/decorators/http-method.test.ts
import { describe, expect, it } from 'vitest';

import { getRouteMetadata } from '../internal/metadata';
import { Delete, Get, Patch, Post, Put } from './http-method';

describe('HTTP method decorators (legacy form)', () => {
  it('registers GET / POST / PUT / PATCH / DELETE in declaration order', () => {
    class C {
      @Get('/')
      list() {}
      @Get('/:id')
      show() {}
      @Post('/')
      create() {}
      @Put('/:id')
      replace() {}
      @Patch('/:id')
      update() {}
      @Delete('/:id')
      destroy() {}
    }
    // legacy decorator は class declaration 時に発火するため new C() 不要
    expect(getRouteMetadata(C)).toEqual([
      { method: 'GET', path: '/', methodName: 'list' },
      { method: 'GET', path: '/:id', methodName: 'show' },
      { method: 'POST', path: '/', methodName: 'create' },
      { method: 'PUT', path: '/:id', methodName: 'replace' },
      { method: 'PATCH', path: '/:id', methodName: 'update' },
      { method: 'DELETE', path: '/:id', methodName: 'destroy' },
    ]);
  });

  it('rejects static methods (target is the constructor itself)', () => {
    // legacy method decorator: instance method なら target は prototype、static なら target は class.
    // typeof target === 'function' で static を識別して throw する。
    expect(() => {
      class S {
        @Get('/')
        static foo() {
          return null;
        }
      }
      void S;
    }).toThrow(/static/);
  });

  // legacy decorator は private (#priv) には適用不可 (TS が syntax error にする)
  // ので runtime check は不要。test も省略。
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @koya/core test src/decorators/http-method`
Expected: FAIL with "Cannot find module './http-method'"

- [ ] **Step 3: Write minimal implementation**

**legacy method decorator** で書く (Spike findings 参照)。legacy では:
- decorator は **class declaration 時に 1 回だけ発火** (Stage 3 の `addInitializer` per-instance とは異なる)
- instance method の場合 `target` は prototype、static method の場合 `target` は class そのもの
- `typeof target === 'function'` で static を識別して throw

```ts
// packages/core/src/decorators/http-method.ts
import { appendRouteMetadata, type HttpMethod } from '../internal/metadata';

const makeDecorator = (method: HttpMethod) => (path: string): MethodDecorator =>
  (target, propertyKey): void => {
    // legacy method decorator: target は prototype (instance method) または class (static)
    if (typeof target === 'function') {
      throw new Error(`koya: @${method} cannot be applied to static methods`);
    }
    const cls = (target as { readonly constructor: object }).constructor;
    appendRouteMetadata(cls, { method, path, methodName: propertyKey });
  };

export const Get = makeDecorator('GET');
export const Post = makeDecorator('POST');
export const Put = makeDecorator('PUT');
export const Patch = makeDecorator('PATCH');
export const Delete = makeDecorator('DELETE');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @koya/core test src/decorators/http-method`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/decorators/http-method.ts packages/core/src/decorators/http-method.test.ts
git commit -m "feat(core): add HTTP method decorators (Get/Post/Put/Patch/Delete)"
```

---

## Task 5: `inject()` re-export from `@needle-di/core`

**Files:**
- Create: `packages/core/src/primitives/inject.ts`
- Test: `packages/core/src/primitives/inject.test.ts`

spec §5.2 / §10 #10 / §11 #6 の責務分離通り、`inject` は **constructor 引数 default 専用**。`@needle-di/core` の `inject` を re-export し、独自実装は持たない。test では constructor injection の resolve 経路が動くことを確認する。

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/primitives/inject.test.ts
import { Container, injectable } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { inject } from './inject';

@injectable()
class Service {
  hello() {
    return 'world';
  }
}

@injectable()
class Consumer {
  constructor(private readonly service = inject(Service)) {}
  greet() {
    return this.service.hello();
  }
}

describe('inject (re-export)', () => {
  it('resolves a constructor default through container.get', () => {
    const container = new Container();
    container.bind(Service);
    container.bind(Consumer);
    expect(container.get(Consumer).greet()).toBe('world');
  });

  it('shares the same instance per Application scope (singleton by default)', () => {
    const container = new Container();
    container.bind(Service);
    container.bind(Consumer);
    expect(container.get(Consumer)).toBe(container.get(Consumer));
  });

  it('throws when token is not bound', () => {
    @injectable()
    class Orphan {
      constructor(public dep = inject(Service)) {}
    }
    const container = new Container();
    container.bind(Orphan); // Service は bind しない
    expect(() => container.get(Orphan)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @koya/core test src/primitives/inject`
Expected: FAIL with "Cannot find module './inject'"

- [ ] **Step 3: Write the implementation (re-export only)**

```ts
// packages/core/src/primitives/inject.ts
export { inject } from '@needle-di/core';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @koya/core test src/primitives/inject`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/primitives/inject.ts packages/core/src/primitives/inject.test.ts
git commit -m "feat(core): re-export inject from @needle-di/core for constructor DI"
```

---

## Task 6: `validated()` primitive (valibot)

**Files:**
- Create: `packages/core/src/primitives/validated.ts`
- Test: `packages/core/src/primitives/validated.test.ts`

ALS context の `input.body` を valibot schema で parse する。schema 違反は throw（global error handler が 400 にする）。

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/primitives/validated.test.ts
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';

import { runInEntryContext } from '../internal/entry-context';
import { validated } from './validated';

const Schema = v.object({ name: v.string(), age: v.number() });

describe('validated()', () => {
  it('returns parsed body when schema matches', () => {
    const result = runInEntryContext(
      {
        input: { body: { name: 'Ada', age: 36 }, pathParams: {} },
        container: {} as never,
      },
      () => validated(Schema),
    );
    expect(result).toEqual({ name: 'Ada', age: 36 });
  });

  it('throws ValiError when schema does not match', () => {
    expect(() =>
      runInEntryContext(
        { input: { body: { name: 'Ada' }, pathParams: {} }, container: {} as never },
        () => validated(Schema),
      ),
    ).toThrow(v.ValiError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @koya/core test src/primitives/validated`
Expected: FAIL with "Cannot find module './validated'"

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/primitives/validated.ts
import * as v from 'valibot';

import { getEntryContext } from '../internal/entry-context';

export const validated = <Schema extends v.GenericSchema>(
  schema: Schema,
): v.InferOutput<Schema> => {
  const ctx = getEntryContext();
  return v.parse(schema, ctx.input.body);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @koya/core test src/primitives/validated`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/primitives/validated.ts packages/core/src/primitives/validated.test.ts
git commit -m "feat(core): add validated() primitive (valibot)"
```

---

## Task 7: `pathParam()` primitive

**Files:**
- Create: `packages/core/src/primitives/path-param.ts`
- Test: `packages/core/src/primitives/path-param.test.ts`

ALS context の `input.pathParams[name]` を取り出す。存在しなければ throw。

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/primitives/path-param.test.ts
import { describe, expect, it } from 'vitest';

import { runInEntryContext } from '../internal/entry-context';
import { pathParam } from './path-param';

describe('pathParam()', () => {
  it('returns the path param value', () => {
    const result = runInEntryContext(
      { input: { body: undefined, pathParams: { id: '42' } }, container: {} as never },
      () => pathParam('id'),
    );
    expect(result).toBe('42');
  });

  it('throws when the path param is absent', () => {
    expect(() =>
      runInEntryContext(
        { input: { body: undefined, pathParams: {} }, container: {} as never },
        () => pathParam('id'),
      ),
    ).toThrow(/path parameter "id" is not defined/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @koya/core test src/primitives/path-param`
Expected: FAIL with "Cannot find module './path-param'"

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/primitives/path-param.ts
import { getEntryContext } from '../internal/entry-context';

export const pathParam = (name: string): string => {
  const value = getEntryContext().input.pathParams[name];
  if (value === undefined) {
    throw new Error(`koya: path parameter "${name}" is not defined`);
  }
  return value;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @koya/core test src/primitives/path-param`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/primitives/path-param.ts packages/core/src/primitives/path-param.test.ts
git commit -m "feat(core): add pathParam() primitive"
```

---

## Task 8: `createApp` / `Application` (opaque, http() shape only)

**Files:**
- Create: `packages/core/src/application.ts`
- Test: `packages/core/src/application.test.ts`

`createApp({ providers })` で `@needle-di/core.Container` を生成し providers を bind する。`Application` は **opaque 型**で、`http()` メソッドだけを公開する (`container` を public 型に出さない、spec §9.4)。`http()` の実装は Task 10 で完成させ、Task 8 では shape (関数の存在) のみ確定する。

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/application.test.ts
import { injectable } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { createApp } from './application';

@injectable()
class Service {}

describe('createApp', () => {
  it('returns an Application exposing http() function', () => {
    const app = createApp({ providers: [Service] });
    expect(typeof app.http).toBe('function');
  });

  it('does not expose the underlying container as a public field', () => {
    const app = createApp({ providers: [] });
    expect((app as { container?: unknown }).container).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @koya/core test src/application`
Expected: FAIL with "Cannot find module './application'"

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/application.ts
import { Container, type Provider } from '@needle-di/core';

import type { HttpRuntime, HttpRuntimeOptions } from './http/runtime';

export type Application = {
  readonly http: (options: HttpRuntimeOptions) => HttpRuntime;
};

export type CreateAppOptions = {
  readonly providers: readonly Provider<unknown>[];
};

export const createApp = (options: CreateAppOptions): Application => {
  const container = new Container();
  for (const provider of options.providers) {
    container.bind(provider);
  }
  // Task 10 で http() を `createHttpRuntime(container, httpOptions)` に差し替える
  return {
    http: () => {
      throw new Error('koya: http() implementation deferred to Task 10');
    },
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @koya/core test src/application`
Expected: PASS (2 tests; `http()` メソッドは存在確認のみ、実行は Task 10 で完成)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/application.ts packages/core/src/application.test.ts
git commit -m "feat(core): add createApp + opaque Application (http stub)"
```

---

## Task 9: Internal route-builder (pure helpers + Hono bridge)

**Files:**
- Create: `packages/core/src/internal/route-builder.ts`
- Test: `packages/core/src/internal/route-builder.test.ts`

route-builder を 3 層に分ける:
1. `joinPath(base, sub)` — pure 関数 (Hono 非依存)
2. `collectRoutes(controllers)` — controller class → flat `Route[]` 構造への変換 (Hono 非依存)
3. `buildRoutes(hono, controllers, container)` — `collectRoutes` + Hono への登録 (Hono 依存、internal のみ)

**Test は (1)(2) のみ unit test する**。`buildRoutes` の挙動は Task 10 の `app.http().toWorker()` integration test で間接検証する (Hono を test から直接 import しない / spec §4.1 隠蔽方針)。

- [ ] **Step 1: Write the failing test (pure helpers only)**

```ts
// packages/core/src/internal/route-builder.test.ts
import { describe, expect, it } from 'vitest';

import { Controller } from '../decorators/controller';
import { Get, Post } from '../decorators/http-method';

import { collectRoutes, joinPath } from './route-builder';

describe('joinPath', () => {
  it.each([
    ['/users', '/:id', '/users/:id'],
    ['/users/', '/:id', '/users/:id'],
    ['/users', ':id', '/users/:id'],
    ['/', '/', '/'],
    ['/users', '', '/users'],
    ['', '/foo', '/foo'],
  ])('joins %s + %s -> %s', (a, b, expected) => {
    expect(joinPath(a, b)).toBe(expected);
  });
});

describe('collectRoutes', () => {
  it('flattens controller routes with full paths', () => {
    @Controller('/users')
    class UserController {
      @Get('/:id')
      show() {}
      @Post('/')
      create() {}
    }
    // legacy decorator は class declaration 時に metadata 確定済 (new() 不要)

    const routes = collectRoutes([UserController]);
    expect(routes).toHaveLength(2);
    expect(routes[0]).toMatchObject({
      method: 'GET',
      fullPath: '/users/:id',
      methodName: 'show',
      controllerClass: UserController,
    });
    expect(routes[1]).toMatchObject({
      method: 'POST',
      fullPath: '/users',
      methodName: 'create',
    });
  });

  it('throws when a controller is missing @Controller', () => {
    class NoDecorator {
      @Get('/')
      list() {}
    }
    expect(() => collectRoutes([NoDecorator])).toThrow(/missing @Controller/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @koya/core test src/internal/route-builder`
Expected: FAIL with "Cannot find module './route-builder'"

- [ ] **Step 3: Write the implementation**

`buildRoutes` の handler は Task 9 時点では **try/catch なし**。Task 11 で `toErrorResponse` を import して try/catch でラップする。

```ts
// packages/core/src/internal/route-builder.ts
import type { Container, Token } from '@needle-di/core';
import type { Hono } from 'hono';

import { runInEntryContext } from './entry-context';
import { getControllerMetadata, getRouteMetadata, type HttpMethod } from './metadata';

export const joinPath = (base: string, sub: string): string => {
  if (base === '' && sub === '') return '/';
  const a = base.endsWith('/') ? base.slice(0, -1) : base;
  const b = sub === '' ? '' : sub.startsWith('/') ? sub : `/${sub}`;
  return `${a}${b}` || '/';
};

export type Route = {
  readonly method: HttpMethod;
  readonly fullPath: string;
  readonly methodName: string | symbol;
  readonly controllerClass: object;
};

export const collectRoutes = (controllers: readonly object[]): readonly Route[] => {
  const routes: Route[] = [];
  for (const cls of controllers) {
    const meta = getControllerMetadata(cls);
    if (!meta) {
      throw new Error('koya: controller is missing @Controller decorator');
    }
    for (const r of getRouteMetadata(cls)) {
      routes.push({
        method: r.method,
        fullPath: joinPath(meta.basePath, r.path),
        methodName: r.methodName,
        controllerClass: cls,
      });
    }
  }
  return routes;
};

const honoMethodMap = {
  GET: 'get',
  POST: 'post',
  PUT: 'put',
  PATCH: 'patch',
  DELETE: 'delete',
} as const;

const callHandler = (
  handler: object,
  methodName: string | symbol,
): (() => unknown) => {
  const fn = (handler as Record<string | symbol, unknown>)[methodName];
  if (typeof fn !== 'function') {
    throw new Error(
      `koya: route handler ${String(methodName)} is not a function on the controller`,
    );
  }
  return (fn as (this: object) => unknown).bind(handler);
};

export const buildRoutes = (
  hono: Hono,
  controllers: readonly Token<object>[],
  container: Container,
): void => {
  const routes = collectRoutes(controllers as readonly object[]);
  for (const route of routes) {
    const instance = container.get(route.controllerClass as Token<object>);
    const invoke = callHandler(instance, route.methodName);
    const honoFn = honoMethodMap[route.method];
    hono[honoFn](route.fullPath, async (c) => {
      const body =
        c.req.header('content-type')?.includes('application/json')
          ? await c.req.json().catch(() => undefined)
          : undefined;
      const result = await runInEntryContext(
        {
          input: { body, pathParams: c.req.param() as Readonly<Record<string, string>> },
          container,
        },
        async () => invoke(),
      );
      return Response.json(result as never);
    });
  }
};
```

`buildRoutes` には `as Token<object>` の局所 cast が残るが、これは `collectRoutes` が `object[]` で扱う型と needle-di の `Token<T>` の橋渡しのためで、ファイル内に閉じている。ユーザーは `Application.http({ controllers })` 経由でしか触らないので公開型には漏れない。

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @koya/core test src/internal/route-builder`
Expected: PASS (joinPath 6 cases + collectRoutes 2 tests)。`buildRoutes` の動作は Task 10 で integration test。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/internal/route-builder.ts packages/core/src/internal/route-builder.test.ts
git commit -m "feat(core): add internal route-builder (joinPath/collectRoutes/buildRoutes)"
```

---

## Task 10: HTTP Runtime adapter + `toWorker()` (Task 8 stub を実装に置換)

**Files:**
- Modify: `packages/core/src/application.ts` (Task 8 の `http()` stub を実装で置換)
- Create: `packages/core/src/http/runtime.ts`
- Test: `packages/core/src/http/runtime.test.ts`

Task 8 で stub だった `Application.http()` を `createHttpRuntime` に差し替え、`toWorker()` で `{ fetch }` を返す Workers handler を実装する。`WorkerHandler.fetch` は hono.fetch の戻り値 (`Response | Promise<Response>`) をそのまま受け流せる型にする。

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/http/runtime.test.ts
import { injectable } from '@needle-di/core';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { createApp } from '../application';
import { Controller } from '../decorators/controller';
import { Get, Post } from '../decorators/http-method';
import { inject } from '../primitives/inject';
import { pathParam } from '../primitives/path-param';
import { validated } from '../primitives/validated';

@injectable()
class Greeter {
  greet(name: string) {
    return `hello, ${name}`;
  }
}

@Controller('/hello')
class HelloController {
  // constructor injection (spec §5.2): inject is needle-di re-export
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

const buildWorker = () => {
  const app = createApp({
    providers: [Greeter, HelloController, EchoController],
  });
  return app.http({ controllers: [HelloController, EchoController] }).toWorker();
};

describe('app.http().toWorker()', () => {
  it('serves a constructor-injected GET endpoint with pathParam', async () => {
    const worker = buildWorker();
    const res = await worker.fetch(new Request('https://example.com/hello/koya'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello, koya' });
  });

  it('parses JSON body via validated()', async () => {
    const worker = buildWorker();
    const res = await worker.fetch(
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
    const worker = buildWorker();
    const a = await worker.fetch(new Request('https://example.com/hello/x'));
    const b = await worker.fetch(
      new Request('https://example.com/echo/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msg: 'y' }),
      }),
    );
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  it('throws at app.http() construction when a controller is missing @Controller', () => {
    class NoDecorator {
      @Get('/')
      list() {}
    }
    new NoDecorator();
    const app = createApp({ providers: [] });
    expect(() =>
      app.http({ controllers: [NoDecorator] }).toWorker(),
    ).toThrow(/missing @Controller/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @koya/core test src/http/runtime`
Expected: FAIL — Task 8 stub から `koya: http() implementation deferred to Task 10` が throw されるか、`runtime.ts` 不在エラー

- [ ] **Step 3: Write `http/runtime.ts`**

```ts
// packages/core/src/http/runtime.ts
import type { Container, Token } from '@needle-di/core';
import { Hono } from 'hono';

import { buildRoutes } from '../internal/route-builder';

export type HttpRuntimeOptions = {
  readonly controllers: readonly Token<object>[];
};

export type WorkerHandler = {
  readonly fetch: (request: Request) => Response | Promise<Response>;
};

export type HttpRuntime = {
  readonly toWorker: () => WorkerHandler;
};

export const createHttpRuntime = (
  container: Container,
  options: HttpRuntimeOptions,
): HttpRuntime => {
  const hono = new Hono();
  buildRoutes(hono, options.controllers, container);
  return {
    toWorker: () => ({
      fetch: (request) => hono.fetch(request),
    }),
  };
};
```

- [ ] **Step 4: Replace the stub in `application.ts`**

Edit `packages/core/src/application.ts`:

```ts
import { Container, type Provider } from '@needle-di/core';

import { createHttpRuntime, type HttpRuntime, type HttpRuntimeOptions } from './http/runtime';

export type Application = {
  readonly http: (options: HttpRuntimeOptions) => HttpRuntime;
};

export type CreateAppOptions = {
  readonly providers: readonly Provider<unknown>[];
};

export const createApp = (options: CreateAppOptions): Application => {
  const container = new Container();
  for (const provider of options.providers) {
    container.bind(provider);
  }
  return {
    http: (httpOptions) => createHttpRuntime(container, httpOptions),
  };
};
```

- [ ] **Step 5: Run all related tests**

Run: `pnpm --filter @koya/core test src/http/runtime src/application`
Expected: PASS (4 runtime tests + 2 application tests from Task 8)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/application.ts packages/core/src/http/runtime.ts packages/core/src/http/runtime.test.ts
git commit -m "feat(core): implement app.http() runtime adapter + toWorker()"
```

---

## Task 11: Global error handler

**Files:**
- Create: `packages/core/src/http/error-handler.ts`
- Modify: `packages/core/src/internal/route-builder.ts`
- Test: `packages/core/src/http/error-handler.test.ts`

`validated()` が throw した `ValiError` を 400、その他の `Error` を 500 にする。Hono の `app.onError()` で登録するのではなく、route handler 内で try/catch して response 化する (testing から直接呼べるように)。

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/http/error-handler.test.ts
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';

import { toErrorResponse } from './error-handler';

describe('toErrorResponse', () => {
  it('returns 400 with structured issues for ValiError', async () => {
    const issues = v.safeParse(v.object({ name: v.string() }), {}).issues!;
    const error = new v.ValiError(issues);
    const res = toErrorResponse(error);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; issues: unknown[] };
    expect(json.error).toBe('validation_failed');
    expect(json.issues.length).toBeGreaterThan(0);
  });

  it('returns 500 for generic Error with the original message', async () => {
    const res = toErrorResponse(new Error('boom'));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string; message: string };
    expect(json).toEqual({ error: 'internal_error', message: 'boom' });
  });

  it('returns 500 for non-Error thrown values with a fallback message', async () => {
    const res = toErrorResponse('not an Error');
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string; message: string };
    expect(json.message).toBe('unknown error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @koya/core test src/http/error-handler`
Expected: FAIL with "Cannot find module './error-handler'"

- [ ] **Step 3: Write `error-handler.ts`**

```ts
// packages/core/src/http/error-handler.ts
import * as v from 'valibot';

export const toErrorResponse = (error: unknown): Response => {
  if (error instanceof v.ValiError) {
    return Response.json(
      { error: 'validation_failed', issues: error.issues },
      { status: 400 },
    );
  }
  const message = error instanceof Error ? error.message : 'unknown error';
  return Response.json({ error: 'internal_error', message }, { status: 500 });
};
```

- [ ] **Step 4: Wire it into `route-builder.ts`**

Replace the route-builder handler body with try/catch that delegates to `toErrorResponse`. In `packages/core/src/internal/route-builder.ts`, add the import:

```ts
import { toErrorResponse } from '../http/error-handler';
```

And wrap the existing `hono[honoFn](route.fullPath, ...)` body with try/catch:

```ts
hono[honoFn](route.fullPath, async (c) => {
  try {
    const body =
      c.req.header('content-type')?.includes('application/json')
        ? await c.req.json().catch(() => undefined)
        : undefined;
    const result = await runInEntryContext(
      {
        input: { body, pathParams: c.req.param() as Readonly<Record<string, string>> },
        container,
      },
      async () => invoke(),
    );
    return Response.json(result as never);
  } catch (error) {
    return toErrorResponse(error);
  }
});
```

- [ ] **Step 5: Append error path integration tests to `runtime.test.ts`**

Reuse the `EchoController` / `buildWorker` helper already defined in Task 10.

```ts
describe('error paths', () => {
  it('returns 400 when validated() rejects the body', async () => {
    const worker = buildWorker();
    const res = await worker.fetch(
      new Request('https://example.com/echo/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msg: 42 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for malformed JSON body (validated() sees undefined)', async () => {
    const worker = buildWorker();
    const res = await worker.fetch(
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
        return { v: pathParam('id') }; // ルートに :id が無いので 500
      }
    }
    const app = createApp({ providers: [BrokenController] });
    const w = app.http({ controllers: [BrokenController] }).toWorker();
    const res = await w.fetch(new Request('https://example.com/x/'));
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 6: Run all tests to verify they pass**

Run: `pnpm --filter @koya/core test`
Expected: PASS (all tests across the package)

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/http/error-handler.ts packages/core/src/http/error-handler.test.ts packages/core/src/internal/route-builder.ts packages/core/src/http/runtime.test.ts
git commit -m "feat(core): add global error handler (validation -> 400, others -> 500)"
```

---

## Task 12: Public barrel + index.ts

**Files:**
- Modify: `packages/core/src/index.ts`

公開 API のみを barrel から re-export する。`internal/*` と `http/runtime.ts` の Hono 型は **import せず** (型が dist d.ts に漏れないようにするため、`Hono` を返す関数は内部で隠蔽済)。

- [ ] **Step 1: Replace `packages/core/src/index.ts`**

`@9wick/eslint-plugin-strict-type-rules` の barrel rule が type/value 分離を要求するか Task 0 spike で確認済の前提。安全側に倒して **value 行と type 行を完全に分離する**。これにより `Application` 型が `Container` 経由で値レイヤから流入しないことも明示できる。

```ts
// packages/core/src/index.ts
export { createApp } from './application';
export type { Application, CreateAppOptions } from './application';

export { Controller } from './decorators/controller';
export { Delete, Get, Patch, Post, Put } from './decorators/http-method';

export { inject } from './primitives/inject';
export { pathParam } from './primitives/path-param';
export { validated } from './primitives/validated';

export type { HttpRuntime, HttpRuntimeOptions, WorkerHandler } from './http/runtime';
```

- [ ] **Step 2: Run barrel rule check**

Run: `pnpm --filter @koya/core lint`
Expected: PASS (`@9wick/eslint-plugin-strict-type-rules` の barrel rule が pure re-export 形式を許容することを確認)

- [ ] **Step 3: Run typecheck + build**

Run: `pnpm --filter @koya/core typecheck && pnpm --filter @koya/core build`
Expected: PASS

- [ ] **Step 4: Sanity check — verify `index.d.ts` exists**

Run: `test -f packages/core/dist/index.d.ts && echo OK`
Expected: `OK`

本格的な leak 検査と真陽性検証は Task 14 で行う。type-level public API shape test (reviewer Low 指摘) は Phase 2 (4) Testing utility で扱う。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export Phase 2 (1) public API barrel"
```

---

## Task 13: 逸脱 #1〜#3 逆転 + `@koya/testing` HTTP integration invoke

**Files:**
- Modify: `packages/testing/tsconfig.json` (references に core 追加)
- Modify: `packages/testing/package.json` (peerDeps に `@koya/core` 追加)
- Delete: `packages/testing/src/version.ts`
- Modify: `packages/testing/src/index.ts` (version export 削除、testApp export)
- Create: `packages/testing/src/test-app.ts`
- Test: `packages/testing/src/test-app.test.ts`
- Modify: `packages/core/src/index.test.ts` (Phase 1 dogfood 削除)

Phase 1 で `testing → core` を逆向きに依存させていたのを正常化する。`createTestApp(app)` が `request(method, path, body?)` を提供する (spec §4.8 / §8.1)。

- [ ] **Step 1: Modify `packages/testing/tsconfig.json`**

```json
{
  "extends": "@9wick/eslint-plugin-strict-type-rules/tsconfig/strictest.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "tsBuildInfoFile": "./dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../core" }]
}
```

- [ ] **Step 2: Modify `packages/testing/package.json`**

```json
{
  "name": "@koya/testing",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsdown",
    "test": "vitest run"
  },
  "peerDependencies": {
    "@koya/core": "workspace:*",
    "vitest": ">=4 <5"
  }
}
```

- [ ] **Step 3: Modify `packages/core/src/tsconfig.json` references**

In `packages/core/tsconfig.json`, remove the `references: [{ path: "../testing" }]` (Phase 1 deviation #3 leftover). Final:

```json
{
  "extends": "@9wick/eslint-plugin-strict-type-rules/tsconfig/strictest.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "tsBuildInfoFile": "./dist/.tsbuildinfo"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Delete Phase 1 dogfood files**

Run:

```bash
rm packages/testing/src/version.ts
rm packages/core/src/index.test.ts
```

- [ ] **Step 5: Write the failing test for `createTestApp`**

`createTestApp` 固有の責務は「`request(method, path, body?)` が正しく Web Standard `Request` を組み立て、`app.http().toWorker().fetch()` に流す」こと。validation success/failure 自体は Task 10/11 で既にカバー済みなので、ここでは GET/POST 各 1 ケース (success のみ) に絞り、test-app helper の動作を最小限で検証する。`@Controller` decorator が needle-di の `@injectable()` を兼ねる (spec §4.7) ので、ItemController に `@injectable()` は付けない。

```ts
// packages/testing/src/test-app.test.ts
import { Controller, Get, Post, createApp, validated } from '@koya/core';
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';

import { createTestApp } from './test-app';

@Controller('/items')
class ItemController {
  @Get('/')
  list() {
    return { items: ['a', 'b'] };
  }
  @Post('/')
  create() {
    const body = validated(v.object({ name: v.string() }));
    return { created: body.name };
  }
}

const buildTest = () => {
  const app = createApp({ providers: [ItemController] });
  return createTestApp(app, { controllers: [ItemController] });
};

describe('createTestApp', () => {
  it('routes a GET request through the full http runtime', async () => {
    const test = buildTest();
    const res = await test.request('GET', '/items/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: ['a', 'b'] });
  });

  it('serializes a JSON body on POST and reaches validated() in handler', async () => {
    const test = buildTest();
    const res = await test.request('POST', '/items/', { name: 'Ada' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ created: 'Ada' });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @koya/testing test`
Expected: FAIL with "Cannot find module './test-app'"

- [ ] **Step 7: Implement `test-app.ts`**

```ts
// packages/testing/src/test-app.ts
import type { Application, HttpRuntimeOptions } from '@koya/core';

export type TestApp = {
  readonly request: (method: string, path: string, body?: unknown) => Promise<Response>;
};

export const createTestApp = (app: Application, options: HttpRuntimeOptions): TestApp => {
  const worker = app.http(options).toWorker();
  return {
    request: (method, path, body) => {
      const init: RequestInit = body
        ? {
            method,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }
        : { method };
      return worker.fetch(new Request(`https://test.local${path}`, init));
    },
  };
};
```

- [ ] **Step 8: Replace `packages/testing/src/index.ts`**

```ts
// packages/testing/src/index.ts
export { createTestApp, type TestApp } from './test-app';
```

- [ ] **Step 9: Run install + test**

Run: `pnpm install && pnpm --filter @koya/testing test`
Expected: PASS (2 tests)

- [ ] **Step 10: Verify whole monorepo still builds**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: PASS across `@koya/core` and `@koya/testing`

- [ ] **Step 11: Commit**

```bash
git add packages/testing packages/core/tsconfig.json packages/core/src/index.test.ts pnpm-lock.yaml
git commit -m "feat(testing): add createTestApp + reverse phase 1 dogfood deviations"
```

---

## Task 14: CI に public d.ts leak check 追加

**Files:**
- Modify: `.github/workflows/ci.yml`

build 後に `packages/core/dist/index.d.ts` (public d.ts) を grep し、以下の漏出を fail させる (spec §9.3 / §9.4):
- `from 'hono'` / `from 'hono/...'` (静的 import)
- `import('hono')` / `import('hono/...')` (動的 import)
- `@needle-di/core` から `Container` を import している行 (`Token` / `inject` 等は OK)

検査対象は **`index.d.ts` のみ**。internal の `route-builder.d.ts` 等には hono 型が出てよい (utility は internal scope)。さらに「真陽性検証 (positive control)」step を追加し、grep パターン自体のリグレッションを検出する。

- [ ] **Step 1: Add the leak check + positive control steps after `- name: build`**

```yaml
      - name: leak check on public d.ts
        run: |
          set -e
          PUBLIC_DTS="packages/core/dist/index.d.ts"
          [ -f "$PUBLIC_DTS" ] || { echo "missing $PUBLIC_DTS"; exit 1; }

          if grep -E "from ['\"]hono(/|['\"])" "$PUBLIC_DTS"; then
            echo "::error::hono leaked into $PUBLIC_DTS"
            exit 1
          fi
          if grep -E "import\(['\"]hono(/|['\"])" "$PUBLIC_DTS"; then
            echo "::error::hono dynamic import leaked into $PUBLIC_DTS"
            exit 1
          fi
          if grep -E "import \{[^}]*\bContainer\b[^}]*\} from ['\"]@needle-di/core['\"]" "$PUBLIC_DTS"; then
            echo "::error::@needle-di/core.Container leaked into $PUBLIC_DTS"
            exit 1
          fi
          echo "OK: no hono / Container leak in $PUBLIC_DTS"

      - name: verify leak check detects real leaks (positive control)
        run: |
          set -e
          PROBE="packages/core/dist/__leak_probe.d.ts"
          echo 'export * from "hono";' > "$PROBE"
          if grep -E "from ['\"]hono(/|['\"])" "$PROBE"; then
            rm "$PROBE"
            echo "OK: leak detection working"
          else
            rm "$PROBE"
            echo "::error::leak detection regression (probe not detected)"
            exit 1
          fi
```

- [ ] **Step 2: Verify the script locally**

```bash
PUBLIC_DTS=packages/core/dist/index.d.ts
grep -E "from ['\"]hono(/|['\"])" "$PUBLIC_DTS" && echo FAIL || echo "OK: no hono leak"
grep -E "import \{[^}]*\bContainer\b[^}]*\} from ['\"]@needle-di/core['\"]" "$PUBLIC_DTS" && echo FAIL || echo "OK: no Container leak"
```
Expected: both lines print `OK: ...`

```bash
PROBE=packages/core/dist/__leak_probe.d.ts
echo 'export * from "hono";' > "$PROBE"
grep -E "from ['\"]hono(/|['\"])" "$PROBE" && echo "OK: detected" || echo FAIL
rm "$PROBE"
```
Expected: prints `OK: detected`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add public d.ts leak check (hono / Container) + positive control"
```

---

## Task 15: `examples/hello` を Phase 2 API でリライト + 最終確認

**Files:**
- Modify: `examples/hello/package.json` (workers 用 dep 不要、`@koya/core` のみ)
- Modify: `examples/hello/src/main.ts`

Phase 1 の bootstrap stub を Phase 2 API で書き直し、dogfood として `pnpm --filter @examples/hello start` で動作確認する。

- [ ] **Step 1: Replace `examples/hello/src/main.ts`**

`@injectable()` を **二重に付けない** (spec §4.7 で `@Controller` が injectable を兼ねる)。Provider (`Greeter`) は素の class として登録し、Task 0 spike で「`@injectable()` 無しで `container.bind` 可能」を確認済の前提。constructor injection もここで demo する (spec §5.2 / §10 #10)。

```ts
// examples/hello/src/main.ts
import { Controller, Get, createApp, inject, pathParam } from '@koya/core';

class Greeter {
  greet(name: string) {
    return `hello, ${name}`;
  }
}

@Controller('/hello')
class HelloController {
  // constructor injection (inject は @koya/core が @needle-di/core から re-export)
  constructor(private greeter = inject(Greeter)) {}

  @Get('/:name')
  greet() {
    return { message: this.greeter.greet(pathParam('name')) };
  }
}

const app = createApp({ providers: [Greeter, HelloController] });
const worker = app.http({ controllers: [HelloController] }).toWorker();

const res = await worker.fetch(new Request('https://example.local/hello/koya'));
console.log(res.status, await res.json());
```

- [ ] **Step 2: Confirm `examples/hello/package.json` deps are correct**

`@needle-di/core` は example 側では直接使わない (`inject` は `@koya/core` から取る)。依存は `@koya/core` のみ。

```json
{
  "name": "@examples/hello",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node --experimental-strip-types src/main.ts"
  },
  "dependencies": {
    "@koya/core": "workspace:*"
  }
}
```

- [ ] **Step 3: Install + run example**

Run:

```bash
pnpm install
pnpm --filter @examples/hello start
```

Expected: prints `200 { message: 'hello, koya' }`

- [ ] **Step 4: Run the full monorepo verification suite**

Run:

```bash
pnpm format:check && pnpm typecheck && pnpm lint && pnpm build && pnpm test && pnpm knip
```

Expected: all PASS, no uncommitted changes printed

- [ ] **Step 5: Commit**

```bash
git add examples/hello/src/main.ts examples/hello/package.json pnpm-lock.yaml
git commit -m "feat(examples): rewrite hello example with Phase 2 API"
```

---

## Task 16: 設計改訂 — Provider DSL 廃止 + `createApp` → `createHttpApp` 統合

**Files:**
- Delete: `packages/core/src/application.ts` + `packages/core/src/application.test.ts`
- Rename: `packages/core/src/http/runtime.ts` → `packages/core/src/http/app.ts` (型名は `HttpRuntime` → `HttpApp`、`HttpRuntimeOptions` → `CreateHttpAppOptions`)
- Modify: `packages/core/src/http/app.ts` — `createHttpApp({ controllers })` を export、内部で `createContainer(controllers)` を呼ぶ
- Modify: `packages/core/src/internal/container.ts` — シグネチャを `createContainer(controllers: readonly Class<object>[])` に変更 (旧 `providers` 引数を捨てる)
- Modify: `packages/core/src/index.ts` — `createApp` / `Application` / `CreateAppOptions` の export を削除し、`createHttpApp` / `HttpApp` / `CreateHttpAppOptions` に置換
- Modify: `packages/testing/src/test-app.ts` — `createTestApp(options: CreateHttpAppOptions)` の単一引数形に
- Modify: `examples/hello/src/main.ts` — `createHttpApp({ controllers: [HelloController] }).toWorker()` に書き換え (`Greeter` は auto-bind 対象なので登録不要)
- Modify: `packages/core/src/http/runtime.test.ts` (rename 後 `http/app.test.ts`) — `createApp` 経由テストを `createHttpApp` 直接形に
- Modify: `packages/core/src/http/error-handler.test.ts` (integration 部分) / `packages/testing/src/test-app.test.ts` — 新 API に追従

**設計根拠:** spec §4.10 (外部境界は adapter class が内包) / §10 #12 (Provider DSL 廃止) / §10 #13 (Application 抽象廃止) / §11 #7 #8

- [ ] **Step 1: `internal/container.ts` を controllers 引数化**

```ts
// packages/core/src/internal/container.ts
import { Container } from '@needle-di/core';

type Class<T> = new (...args: never[]) => T;

export type ResolverHandle = {
  readonly get: <T extends object>(cls: Class<T>) => T;
};

export const createContainer = (
  controllers: readonly Class<object>[],
): ResolverHandle => {
  const container = new Container();
  for (const cls of controllers) {
    container.bind(cls);
  }
  return {
    get: <T extends object>(cls: Class<T>): T => container.get<T>(cls),
  };
};
```

> Note: `Provider` 型 import を削除する。Service / Repository / Adapter は `inject(X)` の auto-bind で解決されるため、`@Controller` decorator の付いた controllers のみ明示 bind する。

- [ ] **Step 2: `http/runtime.ts` を `http/app.ts` に rename + `createHttpApp` 化**

```ts
// packages/core/src/http/app.ts
import { Hono } from 'hono';

import { createContainer } from '../internal/container';
import { buildRoutes } from '../internal/route-builder';

type ControllerClass = new (...args: never[]) => object;

export type CreateHttpAppOptions = {
  readonly controllers: readonly ControllerClass[];
};

export type WorkerHandler = {
  readonly fetch: (request: Request) => Response | Promise<Response>;
};

export type HttpApp = {
  readonly toWorker: () => WorkerHandler;
};

export const createHttpApp = (options: CreateHttpAppOptions): HttpApp => {
  const resolver = createContainer(options.controllers);
  // strict:false で `/echo` と `/echo/` を同一視する。joinPath が末尾スラッシュを正規化するため、
  // 利用者が `@Post('/')` と書いた場合でも `/echo/` リクエストにマッチさせる必要がある。
  const hono = new Hono({ strict: false });
  buildRoutes(hono, options.controllers, resolver);
  return {
    toWorker: () => ({
      fetch: (request) => hono.fetch(request),
    }),
  };
};
```

- [ ] **Step 3: `application.ts` / `application.test.ts` を削除**

```bash
git rm packages/core/src/application.ts packages/core/src/application.test.ts
```

- [ ] **Step 4: `index.ts` barrel を新 API に**

```ts
// packages/core/src/index.ts
export { createHttpApp } from './http/app';
export type { HttpApp, CreateHttpAppOptions, WorkerHandler } from './http/app';

export { Controller } from './decorators/controller';
export { Delete, Get, Patch, Post, Put } from './decorators/http-method';

export { inject } from './primitives/inject';
export { pathParam } from './primitives/path-param';
export { validated } from './primitives/validated';
```

- [ ] **Step 5: `@koya/testing` の signature を単一引数に**

```ts
// packages/testing/src/test-app.ts
import { createHttpApp, type CreateHttpAppOptions } from '@koya/core';

export type TestApp = {
  readonly request: (method: string, path: string, body?: unknown) => Promise<Response>;
};

export const createTestApp = (options: CreateHttpAppOptions): TestApp => {
  const worker = createHttpApp(options).toWorker();
  return {
    request: (method, path, body) => {
      const init: RequestInit = body
        ? { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
        : { method };
      return worker.fetch(new Request(`https://test.local${path}`, init));
    },
  };
};
```

- [ ] **Step 6: `examples/hello/src/main.ts` を新 API に**

```ts
import { Controller, Get, createHttpApp, inject, pathParam } from '@koya/core';

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

const worker = createHttpApp({ controllers: [HelloController] }).toWorker();

const res = await worker.fetch(new Request('https://example.local/hello/koya'));
console.log(res.status, await res.json());
```

> `Greeter` は明示登録しない。`@Controller` decorator が `@injectable()` を兼ねている `HelloController` の constructor で `inject(Greeter)` を呼ぶと、needle-di が auto-bind する。

- [ ] **Step 7: 関連 test を新 API に追従**

旧 `application.test.ts` は削除（Application 抽象自体が消えるため）。`http/app.test.ts` (rename 後) と `testing/test-app.test.ts` で `createApp(...).http({...})` の呼び出しを `createHttpApp({...})` に書き換える。

- [ ] **Step 8: 検証**

```bash
pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm knip
```

Expected: all PASS。

```bash
node --import tsx examples/hello/src/main.ts
```

Expected: `200 { message: 'hello, koya' }`

CI leak check (positive control 含む) も green を確認:

```bash
grep -E "from ['\"]hono(/.+)?['\"]" packages/core/dist/index.d.ts && exit 1 || true
grep -E "import\(['\"]hono(/.+)?['\"]" packages/core/dist/index.d.ts && exit 1 || true
grep -E "(import|from)[^\\n]*['\"]@needle-di/core['\"][^\\n]*\\bContainer\\b" packages/core/dist/index.d.ts && exit 1 || true
```

Expected: 全て exit 0 (= leak なし)。

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(core): drop Application abstraction, ship createHttpApp single form"
```

---

## Done state

After all tasks (Task 0-15 + Task 16 改訂):

- Task 0 spike 完了 — needle-di Stage 3 互換性 / Provider 型 / barrel rule format を確認済、結果が後続タスクに inline 反映されている
- `@koya/core` が以下を export:
  - 値: `createHttpApp`, `Controller`, `Get`/`Post`/`Put`/`Patch`/`Delete`, `inject` (re-export), `validated`, `pathParam`
  - 型: `HttpApp` (opaque, `toWorker()` のみ公開), `CreateHttpAppOptions`, `WorkerHandler`
  - **`@needle-di/core.Container` / `hono.*` は public d.ts に出ない** — CI grep + positive control で担保
- `@koya/testing` が `createTestApp(options)` / `TestApp` を export、`@koya/core` を peerDep で参照 (Phase 1 deviation #1〜#3 reversed)
- `examples/hello` が `createHttpApp` 単一形 + `@injectable()` 無しの constructor injection + path param を dogfood として動作
- CI で hono leak / Container leak / positive control の 3 step が pass
- All tests pass、format / typecheck / lint / build / test / knip のゲートすべて green
- Spec §13 work items 完了

Phase 2 (1) is shippable. Subsequent phases (Error handling + Validation contract / Testing utility resolver override / Lifecycle hook) build on this foundation. **Provider DSL 系の phase は廃止** (spec §4.10 / §10 #12)。
