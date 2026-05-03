# koya Phase 2 (3): Error handling + Validation contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@koya/core` の global error handler (`toErrorResponse`) が `HTTPException` / `ValiError` / generic `Error` を **原則** `KoyaErrorBody` 形式 (valibot で定義する discriminated union) でシリアライズするようにする。`HTTPException.res` で利用者が任意 Response を上書きした場合のみ pass-through で例外的に許容する。`@koya/contract` には影響を与えない。

**Architecture:** `error-schema.ts` で `KoyaErrorBody` を valibot `v.variant('error', [...])` の discriminated union として定義し、既存の `validationErrorBodySchema` はその `validation_failed` variant 単独 schema として再 export することで shape 互換を維持する。`error-handler.ts` の `toErrorResponse` に `HTTPException` 分岐を追加し、`error.res` がある場合は pass-through、無い場合は `KoyaErrorBody` 形式にラップ。`internal_error` は `NODE_ENV === 'development'` のときのみ実 message を返し、それ以外（production / test / undefined）は `'internal server error'` 固定で内部情報の leak を防ぐ。`@koya/contract` の `extract.ts` / `openapi.ts` は `validationErrorBodySchema` / `ValidationErrorBody` を変わらず参照できる。

**Tech Stack:** TypeScript 6.0 / hono 4.12.16 / valibot 1.3.1 / vitest 4.1.5

**Spec:** `docs/superpowers/specs/2026-05-03-koya-phase2-2-contract-design.md` §9.2 (Phase 2 (3) スコープ確定済み)

---

## Design decisions (本 plan で確定)

| # | 論点 | 確定 | 理由 |
|---|---|---|---|
| 1 | `KoyaErrorBody` の構造 | **discriminated union 1 つ** (`v.variant('error', [validationVariant, httpExceptionVariant, internalErrorVariant])`) | 「koya が runtime で返す error 形」が単一 type で表現される方が利用者に分かりやすい |
| 2 | `HTTPException.res` (任意 Response 上書き) の扱い | **pass-through** (`error.res` があればそのまま返す) | spec §10.3 で hono `HTTPException` を re-export 許可。hono 機能をそのまま使える方が自然。利用者が `KoyaErrorBody` 形式を望むなら `throw new HTTPException(status, { message })` を書けば済む |
| 3 | error code 名前空間 | **3 つで固定**: `'validation_failed' \| 'http_exception' \| 'internal_error'` | 将来の追加（`'rate_limited'` 等）はカスタム HTTPException 派生で利用者が表現可能。framework 側で語彙を増やすメリットなし |
| 4 | `HTTPException.cause` の response への含み | **含めない** | 情報 leak 防止。logging も MVP では行わない（必要なら将来 lifecycle hook で利用者が catch） |
| 5 | `validationErrorBodySchema` / `ValidationErrorBody` の export | **既存名 + shape 維持** | `@koya/contract` (`extract.ts`, `openapi.ts`) が `validationErrorBodySchema` の名前と shape を参照しており、変更すると contract 側に伝播する。variant の subset として再 export することで contract 0 changes を実現 |
| 6 | `internal_error.message` の取り扱い | **`NODE_ENV === 'development'` のときだけ実 `error.message`、それ以外（production / test / undefined）は `'internal server error'` 固定** | 実 message を常に返すと内部 stack / connection string / secret 等が leak するリスク。`NODE_ENV` は edge / serverless でも build 時 inline / runtime polyfill が一般的で、`process` が undefined の場合は安全側 (= 隠す) に倒す。debug 性は development 環境でのみ確保 |
| 7 | `toErrorResponse` の dispatch 形式 | **if-else chain (現行スタイル維持)** | 既存 koya コードベースは `instanceof` predicate narrow を if-else で書くスタイル (route-builder, primitive 群)。ts-pattern 等の外部 lib 導入は依存最小化方針 (CLAUDE.md「exact version pin」) と match library の version churn コストに見合わない。3 分岐固定で exhaustiveness も自明 |
| 8 | hono `app.onError` / `app.notFound` との関係 | **route-builder 内 `try/catch` で先に捕捉**（hono global handler に到達しない） | koya は handler 単位で entry context (AsyncLocalStorage) を確立する責務があり、ハンドラ throw は必ず route-builder catch を通す必要がある。利用者が hono `Hono` インスタンスに直接 `onError` を付ける UI は spec §10.3 で禁止 (`Hono` クラスは非露出)。よって衝突は構造的に発生しない |

---

## File Structure

| Path | 役割 | 変更 |
|---|---|---|
| `packages/core/src/http/error-schema.ts` | `KoyaErrorBody` discriminated union + `validationErrorBodySchema` (variant subset) | 改修 |
| `packages/core/src/http/error-schema.test.ts` | `KoyaErrorBody` 3 variants の parse test 追加 / 既存 `validationErrorBodySchema` test は変更なし | 改修 |
| `packages/core/src/http/error-handler.ts` | `HTTPException` 分岐追加 / generic Error 分岐の body 型を `KoyaErrorBody` で型付け | 改修 |
| `packages/core/src/http/error-handler.test.ts` | HTTPException 2 ケース (with/without `res`) 追加 / 既存 test は変更なし | 改修 |
| `packages/core/src/index.ts` | `koyaErrorBodySchema` / `KoyaErrorBody` を barrel export | 改修 |
| `packages/core/src/internal/route-builder.test.ts` | controller 内 `throw new HTTPException` の e2e fetch 検証を追加 | 改修 |

`@koya/contract`、`examples/hello`、spec ファイルは **0 changes**（既存 `validationErrorBodySchema` shape が維持されるため、AppType / OpenAPI 出力は不変）。

---

## Critical implementation references

実装中に参照すべき既存コード:

- `packages/core/src/http/error-schema.ts` — 現状 `validationErrorBodySchema` のみ。`issueSchema` の構造は維持
- `packages/core/src/http/error-handler.ts` — 現状 `ValiError` 分岐のみ、`HTTPException` 未対応
- `packages/core/src/internal/route-builder.ts:73-86` — global error handler の呼び出し箇所 (`catch` で `toErrorResponse` を呼ぶ、本 plan では route-builder 自体は変更しない)
- `packages/contract/src/types/extract.ts:62` — `TypedResponse<ValidationErrorBody, 400, 'json'>` 参照、shape が変わると壊れる
- `packages/contract/src/emit/openapi.ts:121` — `toJsonSchema(validationErrorBodySchema)` runtime 呼び出し、shape が変わると OpenAPI 出力が壊れる
- `examples/hello/generated/openapi.json` — Final verification の OpenAPI snapshot diff の対照（variant 化前後で `components.schemas.ValidationErrorBody` ブロックが byte-equal であること）
- `packages/core/src/internal/route-builder.ts:73-86` — global error handler の呼び出し箇所（`try/catch` で `toErrorResponse` を呼ぶ。論点 8 の通り hono の `app.onError` には到達しない構造、本 plan では route-builder 自体は変更しない）
- `node_modules/hono/dist/types/http-exception.d.ts` — `HTTPException.status` / `.message` / `.res` / `.cause` の actual export 確認用（特に `.status` の型 (`ContentfulStatusCode`) が `Response.json` の第二引数 `status: number` と互換であることの確認）

---

## Task ordering and dependencies

```
Task 1 (KoyaErrorBody variant schema)        ← independent
Task 2 (toErrorResponse HTTPException 対応)   ← Task 1 後
Task 3 (barrel export koyaErrorBodySchema)   ← Task 1 後 (Task 2 と並列可)
Task 4 (route-builder e2e integration test)  ← Task 2 後
```

---

### Task 1: `KoyaErrorBody` discriminated union schema

**Goal:** `error-schema.ts` を拡張し、`KoyaErrorBody` を valibot variant で定義。`validationErrorBodySchema` を `validation_failed` variant の subset 単独 schema として再 export し既存 shape を保つ。

**Files:**
- Modify: `packages/core/src/http/error-schema.ts`
- Modify: `packages/core/src/http/error-schema.test.ts`

- [ ] **Step 1: Write failing tests for KoyaErrorBody variants**

`packages/core/src/http/error-schema.test.ts` の末尾に以下を追記（既存 `describe('validationErrorBodySchema', ...)` は変更しない）:

```ts
import { koyaErrorBodySchema, type KoyaErrorBody } from './error-schema';

describe('koyaErrorBodySchema', () => {
  it('accepts validation_failed variant', () => {
    const body: KoyaErrorBody = { error: 'validation_failed', issues: [] };
    expect(() => v.parse(koyaErrorBodySchema, body)).not.toThrow();
  });

  it('accepts http_exception variant', () => {
    const body: KoyaErrorBody = { error: 'http_exception', message: 'not found' };
    expect(() => v.parse(koyaErrorBodySchema, body)).not.toThrow();
  });

  it('accepts internal_error variant', () => {
    const body: KoyaErrorBody = { error: 'internal_error', message: 'boom' };
    expect(() => v.parse(koyaErrorBodySchema, body)).not.toThrow();
  });

  it('rejects unknown error literal', () => {
    expect(() =>
      v.parse(koyaErrorBodySchema, { error: 'other_error', message: 'x' }),
    ).toThrow();
  });

  it('rejects http_exception without message', () => {
    expect(() => v.parse(koyaErrorBodySchema, { error: 'http_exception' })).toThrow();
  });
});

// 論点 4 (discriminator narrowing) の唯一の検証手段。
// 利用者が `if (body.error === 'http_exception') body.message` で narrow できることを型レベルで保証。
// （test ファイル先頭の vitest import に `expectTypeOf` を追加し、`ValidationErrorBody` 型も既存 import に含める）
describe('KoyaErrorBody — discriminator narrowing (type-level)', () => {
  it('narrows http_exception variant', () => {
    expectTypeOf<Extract<KoyaErrorBody, { error: 'http_exception' }>>().toEqualTypeOf<{
      error: 'http_exception';
      message: string;
    }>();
  });

  it('narrows internal_error variant', () => {
    expectTypeOf<Extract<KoyaErrorBody, { error: 'internal_error' }>>().toEqualTypeOf<{
      error: 'internal_error';
      message: string;
    }>();
  });

  it('narrows validation_failed variant carrying issues array', () => {
    type V = Extract<KoyaErrorBody, { error: 'validation_failed' }>;
    expectTypeOf<V['issues']>().toBeArray();
  });

  it('keeps ValidationErrorBody shape-equal to validation_failed variant', () => {
    expectTypeOf<ValidationErrorBody>().toEqualTypeOf<
      Extract<KoyaErrorBody, { error: 'validation_failed' }>
    >();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @koya/core test -- error-schema`
Expected: FAIL — `koyaErrorBodySchema` / `KoyaErrorBody` not exported.

- [ ] **Step 3: Refactor error-schema.ts to variant form**

`packages/core/src/http/error-schema.ts` を以下に書き換え:

```ts
import * as v from 'valibot';

const issueSchema = v.object({
  kind: v.string(),
  type: v.string(),
  message: v.string(),
  path: v.optional(v.array(v.unknown())),
});

const validationVariant = v.object({
  error: v.literal('validation_failed'),
  issues: v.array(issueSchema),
});

const httpExceptionVariant = v.object({
  error: v.literal('http_exception'),
  message: v.string(),
});

const internalErrorVariant = v.object({
  error: v.literal('internal_error'),
  message: v.string(),
});

export const koyaErrorBodySchema = v.variant('error', [
  validationVariant,
  httpExceptionVariant,
  internalErrorVariant,
]);

// validation_failed variant 単独 schema (既存名互換、@koya/contract から参照される)
export const validationErrorBodySchema = validationVariant;

export type KoyaErrorBody = v.InferOutput<typeof koyaErrorBodySchema>;
export type ValidationErrorBody = v.InferOutput<typeof validationErrorBodySchema>;
```

- [ ] **Step 4: Run all error-schema tests to confirm pass**

Run: `pnpm --filter @koya/core test -- error-schema`
Expected: PASS（既存 3 件 + 新規 5 件 = 8 件）。

- [ ] **Step 5: Run full @koya/core test suite to confirm no regression**

Run: `pnpm --filter @koya/core test`
Expected: PASS（既存テスト全部通過、`validationErrorBodySchema` shape 互換が保たれていることの確認）。

- [ ] **Step 6: Run @koya/contract test suite to confirm zero impact**

Run: `pnpm --filter @koya/contract test`
Expected: PASS（contract 側は `validationErrorBodySchema` を import しているため、shape 変更があれば壊れる。本 task では subset 互換を維持しているので通るはず）。

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/http/error-schema.ts \
        packages/core/src/http/error-schema.test.ts
git commit -m "feat(core): introduce KoyaErrorBody discriminated union schema"
```

---

### Task 2: `toErrorResponse` `HTTPException` 対応 + `internal_error` leak 防御 + body 型統一

**Goal:** `error-handler.ts` の `toErrorResponse` に `HTTPException` 分岐を追加 (論点 2 = pass-through)。`internal_error` は `NODE_ENV === 'development'` のときだけ実 message を返し、それ以外は `'internal server error'` 固定で内部情報の leak を防ぐ (論点 6)。すべての分岐で response body を `KoyaErrorBody` で `satisfies` 型付けし shape の一貫性を強制する。

**Files:**
- Modify: `packages/core/src/http/error-handler.ts`
- Modify: `packages/core/src/http/error-handler.test.ts`

- [ ] **Step 1: Update existing tests for the new internal_error behavior + write new failing tests**

`packages/core/src/http/error-handler.test.ts` を以下のように書き換え（既存 3 件のうち 2 件は `internal_error` の挙動変更で expectations 修正が必要、`ValiError` ケースは変更なし）:

```ts
import * as v from 'valibot';
import { HTTPException } from 'hono/http-exception';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toErrorResponse } from './error-handler';

describe('toErrorResponse — ValiError', () => {
  it('returns 400 with structured issues for ValiError', async () => {
    const result = v.safeParse(v.object({ name: v.string() }), {});
    if (result.issues === undefined) {
      throw new Error('expected ValiError fixture to produce issues');
    }
    const error = new v.ValiError(result.issues);
    const res = toErrorResponse(error);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; issues: unknown[] };
    expect(json.error).toBe('validation_failed');
    expect(json.issues.length).toBeGreaterThan(0);
  });
});

describe('toErrorResponse — HTTPException', () => {
  it('returns status + http_exception body when no res override', async () => {
    const err = new HTTPException(404, { message: 'not found' });
    const res = toErrorResponse(err);
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string; message: string };
    expect(json).toEqual({ error: 'http_exception', message: 'not found' });
  });

  it('passes through res override when present', async () => {
    const custom = Response.json({ custom: true }, { status: 418 });
    const err = new HTTPException(418, { res: custom });
    const res = toErrorResponse(err);
    expect(res.status).toBe(418);
    const json = (await res.json()) as { custom: boolean };
    expect(json).toEqual({ custom: true });
  });

  it('does not leak cause to response body', async () => {
    const err = new HTTPException(500, {
      message: 'wrapped',
      cause: new Error('internal secret'),
    });
    const res = toErrorResponse(err);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({ error: 'http_exception', message: 'wrapped' });
    expect(JSON.stringify(json)).not.toContain('internal secret');
  });
});

describe('toErrorResponse — internal_error (env-guarded message)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the original message when NODE_ENV=development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const res = toErrorResponse(new Error('database connection failed'));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string; message: string };
    expect(json).toEqual({ error: 'internal_error', message: 'database connection failed' });
  });

  it('returns generic message when NODE_ENV=production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = toErrorResponse(new Error('database connection failed'));
    const json = (await res.json()) as { error: string; message: string };
    expect(json).toEqual({ error: 'internal_error', message: 'internal server error' });
  });

  it('returns generic message when NODE_ENV=test', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const res = toErrorResponse(new Error('boom'));
    const json = (await res.json()) as { message: string };
    expect(json.message).toBe('internal server error');
  });

  it('returns generic message when NODE_ENV is undefined', async () => {
    vi.stubEnv('NODE_ENV', undefined as unknown as string);
    const res = toErrorResponse(new Error('boom'));
    const json = (await res.json()) as { message: string };
    expect(json.message).toBe('internal server error');
  });

  it('returns generic message for non-Error thrown values regardless of env', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const res = toErrorResponse('not an Error');
    const json = (await res.json()) as { message: string };
    expect(json.message).toBe('internal server error');
  });
});
```

注: 既存テスト「returns 500 for generic Error with the original message」「returns 500 for non-Error thrown values with a fallback message」は本 task で挙動変更（環境依存化）のため、上記 `internal_error (env-guarded message)` describe に置き換え。spec §9.2 のスコープ確定で internal leak 防御が要件に追加されたため breaking change を許容（v0 段階で外部依存なし）。

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @koya/core test -- error-handler`
Expected: FAIL — `HTTPException` 分岐 + `NODE_ENV` 制御がまだ実装されていない。

- [ ] **Step 3: Update toErrorResponse with HTTPException branch + env-guarded internal_error message**

`packages/core/src/http/error-handler.ts` を以下に書き換え:

```ts
import { HTTPException } from 'hono/http-exception';
import * as v from 'valibot';

import type { KoyaErrorBody } from './error-schema';

// edge / serverless 環境でも `process.env.NODE_ENV` は build 時 inline / runtime polyfill が一般的。
// `process` が undefined の環境では development とみなさず、安全側 (= leak 隠蔽) に倒す。
const isDevelopment = (): boolean => {
  if (typeof process === 'undefined') return false;
  return process.env.NODE_ENV === 'development';
};

const internalErrorMessage = (error: unknown): string =>
  isDevelopment() && error instanceof Error ? error.message : 'internal server error';

export const toErrorResponse = (error: unknown): Response => {
  if (error instanceof v.ValiError) {
    return Response.json(
      { error: 'validation_failed', issues: error.issues } satisfies KoyaErrorBody,
      { status: 400 },
    );
  }
  if (error instanceof HTTPException) {
    // 利用者が constructor で res を渡してきた場合は pass-through (論点 2 = A、原則からの例外)。
    // koya は hono の HTTPException re-export を許容しているため、任意 Response を返す自由度を揃える。
    if (error.res) return error.res;
    return Response.json(
      { error: 'http_exception', message: error.message } satisfies KoyaErrorBody,
      { status: error.status },
    );
  }
  return Response.json(
    { error: 'internal_error', message: internalErrorMessage(error) } satisfies KoyaErrorBody,
    { status: 500 },
  );
};
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm --filter @koya/core test -- error-handler`
Expected: PASS（10 件すべて: ValiError 1 + HTTPException 3 + internal_error 5、加えて type-level test は Task 1 の範囲）。

- [ ] **Step 5: Run full @koya/core suite + typecheck**

Run: `pnpm --filter @koya/core typecheck && pnpm --filter @koya/core test`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/http/error-handler.ts \
        packages/core/src/http/error-handler.test.ts
git commit -m "feat(core): handle HTTPException with KoyaErrorBody and guard internal_error message by NODE_ENV"
```

---

### Task 3: `koyaErrorBodySchema` / `KoyaErrorBody` を barrel export

**Goal:** `@koya/core` の利用者が `KoyaErrorBody` を import して discriminated union を扱えるようにする。

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add export lines**

`packages/core/src/index.ts` の `validationErrorBodySchema` 行直後に追記:

```ts
export { koyaErrorBodySchema } from './http/error-schema';
export type { KoyaErrorBody } from './http/error-schema';
```

- [ ] **Step 2: Smoke-test the barrel export via existing test infra**

Run: `pnpm --filter @koya/core typecheck`
Expected: PASS。barrel に追加した export の型解決確認。

(専用 test は不要。`koyaErrorBodySchema` は Task 1 で test 済み、`KoyaErrorBody` の export 確認は typecheck で十分。)

- [ ] **Step 3: Verify build output**

Run: `pnpm --filter @koya/core build`
Expected: PASS。`dist/index.js` / `dist/index.d.ts` に新規 export が含まれることを spot-check (`grep -E 'koyaErrorBodySchema|KoyaErrorBody' packages/core/dist/index.d.ts`)。

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export koyaErrorBodySchema and KoyaErrorBody from barrel"
```

---

### Task 4: route-builder integration test (`HTTPException` + `ValiError` の wire-contract 検証)

**Goal:** `route-builder.ts` の global catch が `toErrorResponse` 経由で `HTTPException` と `validated()` 経由の `ValiError` を正しい wire 形 (`KoyaErrorBody`) にシリアライズすることを controller / Hono 統合レベルで検証する。`HTTPException.res` pass-through は handler unit (Task 2) で確定済みなので integration では「Hono catch を経ても shape が壊れない」ことだけ確認する最小ケースに絞る。

**Files:**
- Modify: `packages/core/src/internal/route-builder.test.ts`

- [ ] **Step 1: Write failing/new test**

`packages/core/src/internal/route-builder.test.ts` の末尾に追記:

```ts
import { HTTPException } from 'hono/http-exception';
import * as v from 'valibot';

import { validated } from '../primitives/validated';
import { Post } from '../decorators/http-method';

describe('route-builder — error path integration', () => {
  const BodySchema = v.object({ name: v.string() });

  @Controller('/err')
  class ErrController {
    @Get('/not-found')
    nf() {
      throw new HTTPException(404, { message: 'gone' });
    }

    @Get('/teapot')
    tp() {
      // 利用者の res override が Hono catch を経ても pass-through されることの確認 (handler unit で確定済の挙動が integration でも保たれる)
      throw new HTTPException(418, {
        res: Response.json({ shape: 'teapot' }, { status: 418 }),
      });
    }

    @Post('/v')
    v(body = validated(BodySchema)) {
      return { name: body.name };
    }
  }

  const hono = new Hono({ strict: false });
  buildRoutes(hono, [ErrController], createContainer());

  it('serializes HTTPException to status + http_exception body via catch', async () => {
    const res = await hono.fetch(new Request('http://x/err/not-found'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'http_exception', message: 'gone' });
  });

  it('passes through user-provided res override via catch', async () => {
    const res = await hono.fetch(new Request('http://x/err/teapot'));
    expect(res.status).toBe(418);
    expect(await res.json()).toEqual({ shape: 'teapot' });
  });

  it('serializes ValiError from validated() to 400 + validation_failed body', async () => {
    const res = await hono.fetch(
      new Request('http://x/err/v', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 123 }),
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; issues: unknown[] };
    expect(json.error).toBe('validation_failed');
    expect(Array.isArray(json.issues)).toBe(true);
    expect(json.issues.length).toBeGreaterThan(0);
  });
});
```

import 部に既存 `Hono` / `Controller` / `Get` / `createContainer` / `buildRoutes` が無ければ追加（既存 test の import 構成を再利用）。

- [ ] **Step 2: Run test**

Run: `pnpm --filter @koya/core test -- route-builder`
Expected: PASS（既存 + 新規 3 件）。

- [ ] **Step 3: Run full @koya/core suite**

Run: `pnpm --filter @koya/core test`
Expected: PASS。

- [ ] **Step 4: Run examples/hello e2e to confirm no regression**

Run: `pnpm --filter examples-hello test`
Expected: PASS（contract 側 0 changes、runtime error path のみ拡張なので既存 e2e に影響なし）。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/internal/route-builder.test.ts
git commit -m "test(core): cover HTTPException and ValiError end-to-end via route-builder"
```

---

## Final verification

すべての task 完了後に実行:

- [ ] `pnpm -w typecheck` — 全 package で型エラーなし
- [ ] `pnpm -w test` — 全 package で test PASS（routing-controllers / @koya/core / @koya/contract / examples/hello を含む）
- [ ] `pnpm -w build` — 全 package で build 成功
- [ ] `pnpm -w lint` — biome / eslint で違反なし
- [ ] `pnpm --filter examples-hello typecheck` — barrel に追加した `KoyaErrorBody` が example 側に伝搬しても型解決できることを確認
- [ ] `pnpm --filter examples-hello test` — runtime error path 拡張で既存 e2e に regression がないことを確認
- [ ] manual spot-check: `grep -rn "validationErrorBodySchema\|ValidationErrorBody" packages/contract/` で参照箇所が壊れていないことを再確認
- [ ] manual spot-check: `grep -E 'koyaErrorBodySchema|KoyaErrorBody' packages/core/dist/index.d.ts` で barrel export が build 出力に含まれること
- [ ] **OpenAPI snapshot diff**: Task 1 の variant 化前後で `examples/hello/generated/openapi.json` の `components.schemas.ValidationErrorBody` ブロックが byte-equal であることを確認（git で `examples/hello/generated/openapi.json` を `pnpm --filter examples-hello run koya-contract:build` で再生成し、diff が 0 行であること）。これにより `toJsonSchema(validationVariant)` が `toJsonSchema(top-level object)` と同等の JSON Schema を出力することを実測で保証

---

## Self-review notes

- **Phase 2 (3) スコープ忠実性**: spec §9.2 の 3 ケース (`HTTPException` / `Error` / `ValiError`) すべて handler で分岐済み。`KoyaErrorSchema` は valibot で定義済み。contract 0 changes
- **既存 contract 互換**: `validationErrorBodySchema` を variant subset として再 export することで、`@koya/contract` (`extract.ts:62`, `openapi.ts:121`) は無変更で動作。Final verification の OpenAPI snapshot diff が互換性の最終証明
- **`internal_error.message` の leak 防御**: 論点 6 で `NODE_ENV === 'development'` のみ実 message を返す方針を確定。それ以外（production / test / undefined / `process` 自体が未定義）は `'internal server error'` 固定。安全側 default で運用 default も保護される
- **`HTTPException.res` pass-through の例外性**: 「原則は `KoyaErrorBody` 形式」「例外は `error.res` がある場合のみ pass-through」と Goal / Architecture 文言で明示。テスト名 (`'passes through res override when present'`) と plan の論点 2 でも例外性として記録
- **`app.onError` / `app.notFound` 非衝突 (論点 8)**: koya は spec §10.3 で `Hono` クラスを非露出としており、利用者が直接 `app.onError` を付ける UI 自体を提供しない。route-builder 内 try/catch が必ず先に捕捉するため、構造的に衝突しない
- **論点 1〜8 の決定根拠**: 「Design decisions」セクションに記録、後続 phase / レビュー時に振り返れる
- **YAGNI**: 専用 spec ファイル新規作成は skip（Phase 2 (2) spec §9.2 + 本 plan 内 design decisions で必要十分）。`HTTPException.cause` の logging も skip（必要になったら lifecycle hook 導入時に検討）
- **ScopeOut**: 以下は本 phase で扱わない:
  - global error handler の logging / structured logger（別 phase、Phase 2 (5) lifecycle hook で利用者が `onError` を override 可能になる想定）
  - `getResponse()` 経由の任意 Response shape 検証（pass-through なので利用者責任）
  - error metric / sentry 等の外部送信フック（lifecycle hook 導入後に検討）
  - HTTP status code ごとのカスタム handler 登録機構（YAGNI、必要になれば追加）
- **既知リスク (ScopeOut からの格上げ)**:
  - **custom domain error → 500 + 'internal server error' 化**: 利用者が `class DomainError extends Error` のような独自 error を投げると generic Error として 500 で扱われ、production では実 message が消える。logging / hook が無いため運用上の盲点になりうる。Phase 2 (5) lifecycle hook で `onError` を利用者が hook できるようにすることで対処予定。本 phase は MVP として「想定済みドメインエラーは `HTTPException` で投げてくれ」を README / examples で誘導
- **追加 risk**: 利用者が `throw new HTTPException(200, ...)` のような不適切な status を投げた場合は hono の挙動に従う（koya 側で validation はしない）
