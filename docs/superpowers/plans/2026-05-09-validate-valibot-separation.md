# validate-valibot Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract valibot-specific validation logic from `@zeltjs/core` into a new `@zeltjs/validate-valibot` package, enabling future support for other validation libraries (e.g., zod).

**Architecture:** 
- Create `@zeltjs/validate-valibot` with `validated()` function and `/openapi` entrypoint for `valibotAdapter`
- Keep type definitions (`ValidatedMarker`, etc.) in `@zeltjs/core` as they are valibot-agnostic
- Export `@zeltjs/core/runtime` as stable public entrypoint for validation runtime (not `internal`)
- Add `requestValidator` option to `@zeltjs/openapi` config (required only when validated routes exist)
- Define `ValidationErrorBodySchema` as JSON Schema constant in openapi (not valibot schema)
- Remove direct valibot dependency from `@zeltjs/core` and `@zeltjs/openapi`

**Tech Stack:** TypeScript, valibot, @valibot/to-json-schema, tsdown (build)

---

## File Structure

### New Package: `packages/validate-valibot/`

```
packages/validate-valibot/
├── package.json
├── tsconfig.json
├── tsdown.config.ts
├── src/
│   ├── index.ts              # validated() function export
│   ├── validated.ts          # validated() implementation
│   ├── validated.test.ts     # tests moved from core
│   └── openapi/
│       ├── index.ts          # valibotAdapter export
│       └── adapter.ts        # SchemaAdapter implementation
```

### Modified: `packages/core/`

```
packages/core/src/
├── primitives/
│   ├── validated.ts          # DELETE (moved to validate-valibot)
│   ├── validated.test.ts     # DELETE (moved to validate-valibot)
│   └── validated-types.ts    # NEW: type-only definitions
├── runtime/
│   └── index.ts              # NEW: stable public entrypoint for entry-context
├── http/
│   └── error-schema.ts       # MODIFY: remove valibot, use plain types
├── internal/
│   └── route-builder.ts      # MODIFY: remove valibot v.custom/v.is
└── index.ts                  # MODIFY: export from validated-types.ts
```

### Modified: `packages/contract/` (openapi)

```
packages/contract/src/
├── config/
│   └── options.ts            # MODIFY: add requestValidator option
├── emit/
│   ├── json-schema-input.ts  # MODIFY: use adapter.toJsonSchema
│   ├── openapi.ts            # MODIFY: receive adapter, use JSON Schema constant
│   └── validation-error-schema.ts  # NEW: ValidationErrorBody JSON Schema constant
└── types/
    └── schema-adapter.ts     # NEW: SchemaAdapter interface
```

---

### Task 1: Create validate-valibot Package Scaffolding

**Files:**
- Create: `packages/validate-valibot/package.json`
- Create: `packages/validate-valibot/tsconfig.json`
- Create: `packages/validate-valibot/tsdown.config.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@zeltjs/validate-valibot",
  "version": "0.1.0",
  "type": "module",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/zeltjs/zelt.git",
    "directory": "packages/validate-valibot"
  },
  "publishConfig": {
    "access": "public"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./openapi": {
      "types": "./dist/openapi/index.d.ts",
      "import": "./dist/openapi/index.js"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsdown",
    "test": "vitest run",
    "typecheck": "tsc -b"
  },
  "dependencies": {
    "valibot": "1.3.1",
    "@valibot/to-json-schema": "1.6.0"
  },
  "peerDependencies": {
    "@zeltjs/core": "workspace:*",
    "@zeltjs/openapi": "workspace:*"
  },
  "peerDependenciesMeta": {
    "@zeltjs/openapi": {
      "optional": true
    }
  },
  "devDependencies": {
    "@zeltjs/core": "workspace:*",
    "@zeltjs/openapi": "workspace:*",
    "hono": "4.12.16"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "composite": true
  },
  "include": ["src"],
  "references": [{ "path": "../core" }, { "path": "../contract" }]
}
```

- [ ] **Step 3: Create tsdown.config.ts**

```ts
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/openapi/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
```

- [ ] **Step 4: Install dependencies**

Run: `pnpm install`

- [ ] **Step 5: Commit**

```bash
git add packages/validate-valibot/
git commit -m "chore: scaffold @zeltjs/validate-valibot package"
```

---

### Task 2: Create Runtime Entrypoint in Core

**Files:**
- Create: `packages/core/src/runtime/index.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/tsdown.config.ts`

- [ ] **Step 1: Create runtime/index.ts**

Re-export entry-context functions as stable public API:

```ts
// packages/core/src/runtime/index.ts
export { getEntryContext, runInEntryContext } from '../internal/entry-context';
export type { EntryContext, EntryContextInput } from '../internal/entry-context';
```

- [ ] **Step 2: Add runtime export to package.json**

Add to `packages/core/package.json` exports:

```json
"./runtime": {
  "types": "./dist/runtime/index.d.ts",
  "import": "./dist/runtime/index.js"
}
```

- [ ] **Step 3: Update tsdown.config.ts**

```ts
entry: ['src/index.ts', 'src/workers.ts', 'src/lambda.ts', 'src/modules/logger/index.ts', 'src/modules/env/index.ts', 'src/runtime/index.ts'],
```

- [ ] **Step 4: Verify compilation**

Run: `cd packages/core && pnpm build && pnpm typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/core/
git commit -m "feat(core): add stable runtime entrypoint for validation"
```

---

### Task 3: Create validated-types.ts in Core

**Files:**
- Create: `packages/core/src/primitives/validated-types.ts`

- [ ] **Step 1: Write the type definitions file**

```ts
export type ValidationTarget = 'json' | 'form';

declare const __zeltValidatedBrand: unique symbol;
declare const __zeltValidatedType: unique symbol;
declare const __zeltValidatedTarget: unique symbol;

export type ValidatedMarker<T, Target extends ValidationTarget = 'json'> = T & {
  [__zeltValidatedBrand]: true;
  [__zeltValidatedType]: T;
  [__zeltValidatedTarget]: Target;
};

export type ExtractValidated<H> =
  NonNullable<H> extends Record<typeof __zeltValidatedType, infer T> ? T : never;

export type ExtractValidationTarget<H> =
  NonNullable<H> extends Record<typeof __zeltValidatedTarget, infer T extends ValidationTarget>
    ? T
    : 'json';

export type IsValidated<H> =
  NonNullable<H> extends Record<typeof __zeltValidatedBrand, true> ? true : false;
```

- [ ] **Step 2: Verify file compiles**

Run: `cd packages/core && pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/primitives/validated-types.ts
git commit -m "feat(core): extract validated types to dedicated file"
```

---

### Task 4: Implement validated() in validate-valibot

**Files:**
- Create: `packages/validate-valibot/src/validated.ts`
- Create: `packages/validate-valibot/src/index.ts`
- Create: `packages/validate-valibot/src/validated.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { runInEntryContext } from '@zeltjs/core/runtime';

import { validated } from './validated';

const Schema = v.object({ name: v.string(), age: v.number() });

describe('validated()', () => {
  it('returns parsed body when schema matches (json)', () => {
    const result = runInEntryContext(
      {
        input: { jsonBody: { name: 'Ada', age: 36 }, formBody: undefined, pathParams: {} },
        honoContext: {} as unknown as Context,
      },
      () => validated(Schema),
    );
    expect(result).toEqual({ name: 'Ada', age: 36 });
  });

  it('returns parsed body when schema matches (form)', () => {
    const FormSchema = v.object({ name: v.string() });
    const result = runInEntryContext(
      {
        input: { jsonBody: undefined, formBody: { name: 'Ada' }, pathParams: {} },
        honoContext: {} as unknown as Context,
      },
      () => validated(FormSchema, 'form'),
    );
    expect(result).toEqual({ name: 'Ada' });
  });

  it('throws HTTPException with 400 when schema does not match', () => {
    expect(() =>
      runInEntryContext(
        {
          input: { jsonBody: { name: 'Ada' }, formBody: undefined, pathParams: {} },
          honoContext: {} as unknown as Context,
        },
        () => validated(Schema),
      ),
    ).toThrow(HTTPException);
  });

  it('HTTPException contains VALIDATION_FAILED response', async () => {
    try {
      runInEntryContext(
        {
          input: { jsonBody: { name: 'Ada' }, formBody: undefined, pathParams: {} },
          honoContext: {} as unknown as Context,
        },
        () => validated(Schema),
      );
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HTTPException);
      const httpErr = err as HTTPException;
      expect(httpErr.status).toBe(400);
      const res = httpErr.getResponse();
      const json = (await res.json()) as { code: string; issues: unknown[] };
      expect(json.code).toBe('VALIDATION_FAILED');
      expect(json.issues.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/validate-valibot && pnpm test`
Expected: FAIL - module not found

- [ ] **Step 3: Write validated.ts implementation**

```ts
import { HTTPException } from 'hono/http-exception';
import { safeParse, type GenericSchema, type InferOutput } from 'valibot';
import { getEntryContext } from '@zeltjs/core/runtime';
import type { ValidatedMarker, ValidationTarget } from '@zeltjs/core';

export function validated<Schema extends GenericSchema>(
  schema: Schema,
  target?: 'json',
): ValidatedMarker<InferOutput<Schema>, 'json'>;
export function validated<Schema extends GenericSchema>(
  schema: Schema,
  target: 'form',
): ValidatedMarker<InferOutput<Schema>, 'form'>;
export function validated<Schema extends GenericSchema>(
  schema: Schema,
  target: ValidationTarget = 'json',
): InferOutput<Schema> {
  const ctx = getEntryContext();
  const body = target === 'json' ? ctx.input.jsonBody : ctx.input.formBody;
  const result = safeParse(schema, body);
  if (!result.success) {
    throw new HTTPException(400, {
      res: Response.json({ code: 'VALIDATION_FAILED', issues: result.issues }, { status: 400 }),
    });
  }
  return result.output;
}
```

- [ ] **Step 4: Write index.ts export**

```ts
export { validated } from './validated';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/validate-valibot && pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/validate-valibot/src/
git commit -m "feat(validate-valibot): implement validated() function"
```

---

### Task 5: Create SchemaAdapter Interface and ValidationErrorBody Schema in openapi

**Files:**
- Create: `packages/contract/src/types/schema-adapter.ts`
- Create: `packages/contract/src/emit/validation-error-schema.ts`
- Modify: `packages/contract/src/index.ts`

- [ ] **Step 0: Verify existing tests pass**

Run: `pnpm test --filter @zeltjs/openapi`
Expected: PASS

- [ ] **Step 1: Write SchemaAdapter interface**

```ts
// packages/contract/src/types/schema-adapter.ts
export type JsonSchema = {
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly items?: JsonSchema;
  readonly $ref?: string;
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly [key: string]: unknown;
};

export type SchemaAdapter = {
  readonly toJsonSchema: (schema: unknown) => JsonSchema;
};
```

- [ ] **Step 2: Create ValidationErrorBody JSON Schema constant**

```ts
// packages/contract/src/emit/validation-error-schema.ts
import type { JsonSchema } from '../types/schema-adapter';

export const validationErrorBodyJsonSchema: JsonSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', const: 'VALIDATION_FAILED' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string' },
          type: { type: 'string' },
          message: { type: 'string' },
          path: { type: 'array' },
        },
        required: ['kind', 'type', 'message'],
      },
    },
  },
  required: ['code', 'issues'],
};
```

- [ ] **Step 3: Export from index.ts**

Add to `packages/contract/src/index.ts`:

```ts
export type { SchemaAdapter, JsonSchema } from './types/schema-adapter';
```

- [ ] **Step 4: Verify compilation**

Run: `cd packages/contract && pnpm typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/contract/src/types/schema-adapter.ts packages/contract/src/emit/validation-error-schema.ts packages/contract/src/index.ts
git commit -m "feat(openapi): add SchemaAdapter interface and ValidationErrorBody JSON Schema"
```

---

### Task 6: Implement valibotAdapter in validate-valibot

**Files:**
- Create: `packages/validate-valibot/src/openapi/adapter.ts`
- Create: `packages/validate-valibot/src/openapi/index.ts`
- Create: `packages/validate-valibot/src/openapi/adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';

import { valibotAdapter } from './adapter';

describe('valibotAdapter', () => {
  it('converts valibot schema to JSON Schema', () => {
    const schema = v.object({
      name: v.pipe(v.string(), v.minLength(1)),
      age: v.pipe(v.number(), v.minValue(0)),
    });

    const jsonSchema = valibotAdapter.toJsonSchema(schema);

    expect(jsonSchema).toMatchObject({
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        age: { type: 'number', minimum: 0 },
      },
      required: ['name', 'age'],
    });
  });

  it('throws for invalid schema input', () => {
    expect(() => valibotAdapter.toJsonSchema('not a schema')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/validate-valibot && pnpm test`
Expected: FAIL - module not found

- [ ] **Step 3: Write adapter implementation with runtime validation**

```ts
import { toJsonSchema } from '@valibot/to-json-schema';
import type { GenericSchema } from 'valibot';
import type { SchemaAdapter, JsonSchema } from '@zeltjs/openapi';

const isValibotSchema = (value: unknown): value is GenericSchema =>
  typeof value === 'object' &&
  value !== null &&
  'kind' in value &&
  (value as { kind: unknown }).kind === 'schema';

export const valibotAdapter: SchemaAdapter = {
  toJsonSchema: (schema: unknown): JsonSchema => {
    if (!isValibotSchema(schema)) {
      throw new Error('Invalid valibot schema: expected object with kind="schema"');
    }
    return toJsonSchema(schema);
  },
};
```

- [ ] **Step 4: Write openapi index export**

```ts
export { valibotAdapter } from './adapter';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/validate-valibot && pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/validate-valibot/src/openapi/
git commit -m "feat(validate-valibot): implement valibotAdapter for OpenAPI with runtime validation"
```

---

### Task 7: Add requestValidator Option to openapi Config

**Files:**
- Modify: `packages/contract/src/config/options.ts`
- Modify: `packages/contract/src/errors.ts`

- [ ] **Step 0: Verify existing tests pass**

Run: `pnpm test --filter @zeltjs/openapi`
Expected: PASS

- [ ] **Step 1: Update GenerateClientOptions type**

```ts
import type { SchemaAdapter } from '../types/schema-adapter';

export type GenerateClientOptions = {
  readonly controllers: readonly string[];
  readonly dist: string;
  readonly watch?: boolean;
  readonly tsconfig?: string;
  readonly requestValidator?: SchemaAdapter;
};

export const defineConfig = <T extends GenerateClientOptions>(config: T): T => config;
```

- [ ] **Step 2: Add error type to errors.ts**

Add to ConfigError:

```ts
| { type: 'REQUEST_VALIDATOR_REQUIRED' }
```

- [ ] **Step 3: Verify compilation**

Run: `cd packages/contract && pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/contract/src/config/options.ts packages/contract/src/errors.ts
git commit -m "feat(openapi): add requestValidator option to config"
```

---

### Task 8: Update json-schema-input.ts to Use Adapter

**Files:**
- Modify: `packages/contract/src/emit/json-schema-input.ts`

- [ ] **Step 0: Verify existing tests pass**

Run: `pnpm test --filter @zeltjs/openapi`
Expected: PASS

- [ ] **Step 1: Modify resolveRequestSchema to accept adapter**

```ts
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { okAsync, errAsync, ResultAsync } from 'neverthrow';

import type { EmitError } from '../errors';
import type { RequestSchemaRef, ValidationTarget } from '../analyzer/handler';
import type { SchemaAdapter } from '../types/schema-adapter';

export type RequestSchemaJson =
  | {
      kind: 'ref';
      readonly name: string;
      readonly schema: unknown;
      readonly target: ValidationTarget;
    }
  | { kind: 'inline'; readonly schema: unknown; readonly target: ValidationTarget }
  | { kind: 'none' };

const dynamicImport = (url: string, modulePath: string): ResultAsync<unknown, EmitError> =>
  ResultAsync.fromSafePromise(import(url)).mapErr(() => ({
    type: 'MODULE_NOT_OBJECT' as const,
    modulePath,
  }));

const importNamedExport = (
  modulePath: string,
  exportName: string,
): ResultAsync<unknown, EmitError> => {
  const url = pathToFileURL(resolve(modulePath)).href;

  return dynamicImport(url, modulePath).andThen((mod) => {
    if (typeof mod !== 'object' || mod === null) {
      return errAsync({ type: 'MODULE_NOT_OBJECT' as const, modulePath });
    }
    const namespace: Record<string, unknown> = { ...mod };
    const value = namespace[exportName];
    if (value === undefined) {
      return errAsync({ type: 'EXPORT_NOT_FOUND' as const, exportName, modulePath });
    }
    return okAsync(value);
  });
};

const convertSchema = (
  value: unknown,
  adapter: SchemaAdapter,
  exportName: string,
  modulePath: string,
): ResultAsync<unknown, EmitError> => {
  try {
    return okAsync(adapter.toJsonSchema(value));
  } catch (e) {
    return errAsync({
      type: 'SCHEMA_ADAPTER_FAILED' as const,
      exportName,
      modulePath,
      reason: e instanceof Error ? e.message : String(e),
    });
  }
};

export const resolveRequestSchema = (
  ref: RequestSchemaRef,
  adapter: SchemaAdapter,
): ResultAsync<RequestSchemaJson, EmitError> => {
  if (ref.kind === 'none') return okAsync({ kind: 'none' });
  if (ref.kind === 'valibot-inline') {
    return errAsync({ type: 'INLINE_SCHEMA_NOT_SUPPORTED' });
  }

  return importNamedExport(ref.module, ref.exportName).andThen((value) =>
    convertSchema(value, adapter, ref.exportName, ref.module).map((schema) => ({
      kind: 'ref' as const,
      name: ref.exportName,
      schema,
      target: ref.target,
    })),
  );
};
```

- [ ] **Step 2: Add SCHEMA_ADAPTER_FAILED to EmitError in errors.ts**

```ts
| { type: 'SCHEMA_ADAPTER_FAILED'; exportName: string; modulePath: string; reason: string }
```

- [ ] **Step 3: Verify tests still pass**

Run: `pnpm test --filter @zeltjs/openapi`
Expected: PASS (or fail due to signature change - fix callers next)

- [ ] **Step 4: Commit**

```bash
git add packages/contract/src/emit/json-schema-input.ts packages/contract/src/errors.ts
git commit -m "refactor(openapi): update json-schema-input to use SchemaAdapter"
```

---

### Task 9: Update openapi.ts to Use Adapter

**Files:**
- Modify: `packages/contract/src/emit/openapi.ts`

- [ ] **Step 0: Verify existing tests pass**

Run: `pnpm test --filter @zeltjs/openapi`
Expected: May fail due to signature change from Task 8

- [ ] **Step 1: Update emitOpenApi to use adapter and JSON Schema constant**

```ts
import { okAsync, errAsync, type ResultAsync } from 'neverthrow';

import type { ContractError } from '../errors';
import type { RequestSchemaRef } from '../analyzer/handler';
import type { ControllerIR, RouteIR } from '../analyzer/internal-representation';
import type { SchemaAdapter } from '../types/schema-adapter';

import { resolveRequestSchema, type RequestSchemaJson } from './json-schema-input';
import { resolveResponseSchema, type ResponseSchemaJson } from './json-schema-output';
import { validationErrorBodyJsonSchema } from './validation-error-schema';

type EmitOpenApiOptions = {
  readonly distDir: string;
  readonly tsconfigPath: string;
  readonly requestValidator?: SchemaAdapter;
};

type SchemaMap = Record<string, unknown>;
type Operation = Record<string, unknown>;
type PathItem = Record<string, Operation>;

type OpenApiDoc = {
  openapi: '3.1.0';
  readonly info: { readonly title: string; readonly version: string };
  readonly paths: Readonly<Record<string, PathItem>>;
  readonly components: { readonly schemas: Readonly<SchemaMap> };
};

const toOpenApiPath = (p: string): string => p.replace(/:(\w+)/g, '{$1}');

const refTo = (name: string): { $ref: string } => ({
  $ref: `#/components/schemas/${name}`,
});

const targetToContentType = (target: 'json' | 'form'): string =>
  target === 'form' ? 'multipart/form-data' : 'application/json';

const buildRequestBody = (req: RequestSchemaJson, schemas: SchemaMap): Operation | undefined => {
  if (req.kind === 'none') return undefined;
  const contentType = targetToContentType(req.target);
  if (req.kind === 'ref') {
    schemas[req.name] = req.schema;
    return { required: true, content: { [contentType]: { schema: refTo(req.name) } } };
  }
  return { required: true, content: { [contentType]: { schema: req.schema } } };
};

const buildPathParams = (
  pathParams: readonly string[],
): readonly Record<string, unknown>[] | undefined => {
  if (pathParams.length === 0) return undefined;
  return pathParams.map((name) => ({
    in: 'path',
    name,
    required: true,
    schema: { type: 'string' },
  }));
};

const buildResponseEntry = (
  resp: ResponseSchemaJson,
  schemas: SchemaMap,
): { status: string; value: Record<string, unknown> } | undefined => {
  if (resp.kind === 'omit') return undefined;
  if (resp.kind === 'ref') {
    schemas[resp.name] = resp.schema;
    return {
      status: String(resp.status),
      value: { description: '', content: { [resp.contentType]: { schema: refTo(resp.name) } } },
    };
  }
  return {
    status: String(resp.status),
    value: { description: '', content: { [resp.contentType]: { schema: resp.schema } } },
  };
};

const hasValidatedRequest = (req: RequestSchemaRef): boolean =>
  req.kind === 'valibot-named' || req.kind === 'valibot-inline';

const validationFailedResponse = (): Record<string, unknown> => ({
  description: 'validation failed',
  content: { 'application/json': { schema: refTo('ValidationErrorBody') } },
});

const resolveRequestSchemaWithAdapter = (
  ref: RequestSchemaRef,
  adapter: SchemaAdapter | undefined,
): ResultAsync<RequestSchemaJson, ContractError> => {
  if (ref.kind === 'none') return okAsync({ kind: 'none' });
  if (!adapter) {
    return errAsync({ type: 'REQUEST_VALIDATOR_REQUIRED' as const });
  }
  return resolveRequestSchema(ref, adapter);
};

const buildOperation = (
  r: RouteIR,
  schemas: SchemaMap,
  options: EmitOpenApiOptions,
): ResultAsync<Operation, ContractError> => {
  return resolveRequestSchemaWithAdapter(r.requestSchema, options.requestValidator).andThen(
    (reqJson) => {
      const respResult = resolveResponseSchema(r.responseType, {
        tsconfigPath: options.tsconfigPath,
      });
      if (respResult.isErr()) {
        return errAsync(respResult.error);
      }
      const respJson = respResult.value;

      const op: Operation = {};
      const reqBody = buildRequestBody(reqJson, schemas);
      if (reqBody) op['requestBody'] = reqBody;

      const params = buildPathParams(r.pathParams);
      if (params) op['parameters'] = params;

      const responses: Record<string, unknown> = {};
      const respEntry = buildResponseEntry(respJson, schemas);
      if (respEntry) responses[respEntry.status] = respEntry.value;
      if (hasValidatedRequest(r.requestSchema)) {
        responses['400'] = validationFailedResponse();
      }
      op['responses'] = responses;

      return okAsync(op);
    },
  );
};

const addOperation = (
  paths: Record<string, PathItem>,
  oaPath: string,
  method: string,
  op: Operation,
): void => {
  const existing = paths[oaPath] ?? {};
  existing[method.toLowerCase()] = op;
  paths[oaPath] = existing;
};

const hasAnyValidatedRoute = (controllers: readonly ControllerIR[]): boolean =>
  controllers.some((c) => c.routes.some((r) => hasValidatedRequest(r.requestSchema)));

export const emitOpenApi = (
  controllers: readonly ControllerIR[],
  options: EmitOpenApiOptions,
): ResultAsync<OpenApiDoc, ContractError> => {
  const schemas: SchemaMap = {};
  const paths: Record<string, PathItem> = {};

  if (hasAnyValidatedRoute(controllers)) {
    schemas['ValidationErrorBody'] = validationErrorBodyJsonSchema;
  }

  const buildAllOperations = (): ResultAsync<void, ContractError> => {
    let chain: ResultAsync<void, ContractError> = okAsync(undefined);

    for (const c of controllers) {
      for (const r of c.routes) {
        chain = chain.andThen(() =>
          buildOperation(r, schemas, options).map((op) => {
            addOperation(paths, toOpenApiPath(r.fullPath), r.method, op);
            return undefined;
          }),
        );
      }
    }

    return chain;
  };

  return buildAllOperations().map(() => ({
    openapi: '3.1.0' as const,
    info: { title: 'zelt app', version: '0.0.0' },
    paths,
    components: { schemas },
  }));
};
```

- [ ] **Step 2: Verify tests pass**

Run: `pnpm test --filter @zeltjs/openapi`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/contract/src/emit/openapi.ts
git commit -m "refactor(openapi): update emitOpenApi to use SchemaAdapter and JSON Schema constant"
```

---

### Task 10: Update generate-client.ts

**Files:**
- Modify: `packages/contract/src/generate-client.ts`

- [ ] **Step 0: Verify existing tests pass**

Run: `pnpm test --filter @zeltjs/openapi`
Expected: PASS

- [ ] **Step 1: Update generateClient to pass requestValidator**

```ts
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { errAsync, ResultAsync } from 'neverthrow';

import type { ContractError } from './errors';
import { discoverControllers } from './analyzer/discover-controllers';
import { analyzeControllers } from './analyzer/internal-representation';
import { createProject } from './analyzer/project';
import type { GenerateClientOptions } from './config/options';
import { emitAppGen } from './emit/app-gen';
import { emitOpenApi } from './emit/openapi';

const writeIfChanged = async (path: string, content: string): Promise<boolean> => {
  if (existsSync(path)) {
    const existing = await readFile(path, 'utf8');
    if (existing === content) return false;
  }
  await writeFile(path, content, 'utf8');
  return true;
};

export type GenerateClientResult = {
  readonly appGenChanged: boolean;
  readonly openApiChanged: boolean;
};

export const generateClient = (
  options: GenerateClientOptions,
): ResultAsync<GenerateClientResult, ContractError> => {
  const distDir = resolve(options.dist);
  const tsconfigPath = options.tsconfig ? resolve(options.tsconfig) : resolve('tsconfig.json');

  const project = createProject({ tsConfigFilePath: tsconfigPath, controllerFiles: [] });
  const specs = discoverControllers(project, options.controllers);

  const irResult = analyzeControllers(project, specs);
  if (irResult.isErr()) {
    return errAsync(irResult.error);
  }
  const ir = irResult.value;

  return ResultAsync.fromPromise(mkdir(distDir, { recursive: true }), () => ({
    type: 'CONFIG_NOT_FOUND' as const,
  }))
    .andThen(() =>
      emitOpenApi(ir, {
        distDir,
        tsconfigPath,
        requestValidator: options.requestValidator,
      }),
    )
    .andThen((openApiDoc) => {
      const appGenContent = emitAppGen(ir, { distDir });
      const appGenPath = resolve(distDir, 'app.gen.ts');
      const openApiContent = `${JSON.stringify(openApiDoc, null, 2)}\n`;
      const openApiPath = resolve(distDir, 'openapi.json');

      return ResultAsync.fromPromise(
        Promise.all([
          writeIfChanged(appGenPath, appGenContent),
          writeIfChanged(openApiPath, openApiContent),
        ]),
        () => ({ type: 'CONFIG_NOT_FOUND' as const }),
      ).map(([appGenChanged, openApiChanged]) => ({ appGenChanged, openApiChanged }));
    });
};
```

- [ ] **Step 2: Verify compilation and tests**

Run: `cd packages/contract && pnpm typecheck && pnpm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/contract/src/generate-client.ts
git commit -m "refactor(openapi): pass requestValidator through generate-client"
```

---

### Task 11: Remove valibot from openapi package.json

**Files:**
- Modify: `packages/contract/package.json`

- [ ] **Step 0: Verify existing tests pass**

Run: `pnpm test --filter @zeltjs/openapi`
Expected: PASS

- [ ] **Step 1: Remove valibot dependencies**

Remove from dependencies:
- `"@valibot/to-json-schema": "1.6.0"`
- `"valibot": "1.3.1"`

- [ ] **Step 2: Run pnpm install**

Run: `pnpm install`

- [ ] **Step 3: Verify build and tests**

Run: `cd packages/contract && pnpm build && pnpm typecheck && pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/contract/package.json pnpm-lock.yaml
git commit -m "refactor(openapi): remove direct valibot dependency"
```

---

### Task 12: Remove validated.ts from Core and Update Index

**Files:**
- Delete: `packages/core/src/primitives/validated.ts`
- Delete: `packages/core/src/primitives/validated.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 0: Verify existing tests pass**

Run: `pnpm test --filter @zeltjs/core`
Expected: PASS

- [ ] **Step 1: Update core index.ts exports**

Replace:
```ts
export { validated } from './primitives/validated';
export type {
  ValidatedMarker,
  ExtractValidated,
  ExtractValidationTarget,
  IsValidated,
  ValidationTarget,
} from './primitives/validated';
```

With:
```ts
export type {
  ValidatedMarker,
  ExtractValidated,
  ExtractValidationTarget,
  IsValidated,
  ValidationTarget,
} from './primitives/validated-types';
```

- [ ] **Step 2: Delete validated.ts and validated.test.ts**

```bash
rm packages/core/src/primitives/validated.ts
rm packages/core/src/primitives/validated.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/
git commit -m "refactor(core): remove validated.ts, export types from validated-types.ts"
```

---

### Task 13: Remove valibot from error-schema.ts

**Files:**
- Modify: `packages/core/src/http/error-schema.ts`
- Modify: `packages/core/src/http/error-schema.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 0: Verify remaining tests pass**

Run: `pnpm test --filter @zeltjs/core`
Expected: May fail due to deleted tests

- [ ] **Step 1: Rewrite error-schema.ts without valibot**

```ts
export type ValidationIssue = {
  readonly kind: string;
  readonly type: string;
  readonly message: string;
  readonly path?: readonly unknown[];
};

export type ValidationErrorBody = {
  readonly code: 'VALIDATION_FAILED';
  readonly issues: readonly ValidationIssue[];
};

export type InternalErrorBody = {
  readonly code: 'INTERNAL_ERROR';
  readonly message: string;
};

export type ErrorBody = ValidationErrorBody | InternalErrorBody;
```

- [ ] **Step 2: Update error-schema.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import type { ValidationErrorBody, ErrorBody } from './error-schema';

describe('ValidationErrorBody', () => {
  it('type matches expected structure', () => {
    const sample: ValidationErrorBody = {
      code: 'VALIDATION_FAILED',
      issues: [{ kind: 'schema', type: 'string', message: 'Expected string' }],
    };
    expect(sample.code).toBe('VALIDATION_FAILED');
    expect(sample.issues.length).toBe(1);
  });

  it('issues can have optional path', () => {
    const sample: ValidationErrorBody = {
      code: 'VALIDATION_FAILED',
      issues: [{ kind: 'schema', type: 'string', message: 'Expected string', path: ['field'] }],
    };
    expect(sample.issues[0].path).toEqual(['field']);
  });
});

describe('ErrorBody', () => {
  it('can be ValidationErrorBody', () => {
    const body: ErrorBody = {
      code: 'VALIDATION_FAILED',
      issues: [],
    };
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('can be InternalErrorBody', () => {
    const body: ErrorBody = {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    };
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});
```

- [ ] **Step 3: Update core index.ts**

Remove schema exports, keep only type exports:

```ts
export type { ValidationErrorBody, ErrorBody, ValidationIssue, InternalErrorBody } from './http/error-schema';
```

- [ ] **Step 4: Run tests**

Run: `cd packages/core && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/http/error-schema.ts packages/core/src/http/error-schema.test.ts packages/core/src/index.ts
git commit -m "refactor(core): remove valibot from error-schema, use plain types"
```

---

### Task 14: Remove valibot from route-builder.ts

**Files:**
- Modify: `packages/core/src/internal/route-builder.ts`

- [ ] **Step 0: Verify tests pass**

Run: `pnpm test --filter @zeltjs/core`
Expected: PASS

- [ ] **Step 1: Replace valibot with plain TypeScript type guard**

Remove:
```ts
import * as v from 'valibot';
```

Replace:
```ts
const MiddlewareClassSchema = v.custom<MiddlewareClass>(
  (input) =>
    typeof input === 'function' && input.prototype !== undefined && hasUseMethod(input.prototype),
);
```

With:
```ts
const isMiddlewareClass = (input: MiddlewareInput): input is MiddlewareClass =>
  typeof input === 'function' && input.prototype !== undefined && hasUseMethod(input.prototype);
```

Replace usage:
```ts
if (v.is(MiddlewareClassSchema, middleware)) {
```

With:
```ts
if (isMiddlewareClass(middleware)) {
```

- [ ] **Step 2: Verify build and tests**

Run: `cd packages/core && pnpm build && pnpm typecheck && pnpm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/internal/route-builder.ts
git commit -m "refactor(core): replace valibot type guard with plain TypeScript"
```

---

### Task 15: Remove valibot from Core package.json

**Files:**
- Modify: `packages/core/package.json`

- [ ] **Step 0: Verify tests pass**

Run: `pnpm test --filter @zeltjs/core`
Expected: PASS

- [ ] **Step 1: Remove valibot dependency**

Remove from dependencies:
```json
"valibot": "1.3.1"
```

- [ ] **Step 2: Add @zeltjs/validate-valibot as devDependency for tests**

```json
"devDependencies": {
  "@zeltjs/validate-valibot": "workspace:*",
  ...
}
```

- [ ] **Step 3: Run pnpm install**

Run: `pnpm install`

- [ ] **Step 4: Verify full build**

Run: `pnpm build && pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/package.json pnpm-lock.yaml
git commit -m "refactor(core): remove valibot dependency"
```

---

### Task 16: Update Core Tests to Use validate-valibot

**Files:**
- Modify: `packages/core/src/http/app.test.ts`
- Modify: `packages/core/src/internal/route-builder.test.ts`

- [ ] **Step 1: Update app.test.ts imports**

Change:
```ts
import { validated } from '../primitives/validated';
```

To:
```ts
import { validated } from '@zeltjs/validate-valibot';
```

- [ ] **Step 2: Update route-builder.test.ts imports**

Change:
```ts
import { validated } from '../primitives/validated';
```

To:
```ts
import { validated } from '@zeltjs/validate-valibot';
```

- [ ] **Step 3: Run tests**

Run: `cd packages/core && pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/http/app.test.ts packages/core/src/internal/route-builder.test.ts
git commit -m "refactor(core): update tests to use @zeltjs/validate-valibot"
```

---

### Task 17: Update Other Packages Using validated

**Files:**
- Modify: `packages/rate-limit/src/integration.test.ts`
- Modify: `packages/rate-limit/package.json`
- Modify: `packages/contract/src/test/fixtures/sample.controller.ts`
- Modify: `packages/contract/src/test/fixtures/upload.controller.ts`

- [ ] **Step 1: Update rate-limit integration test**

Change imports and add devDependency:
```bash
cd packages/rate-limit && pnpm add -D @zeltjs/validate-valibot@workspace:*
```

Update imports in `integration.test.ts`.

- [ ] **Step 2: Update contract test fixtures**

Update imports in `sample.controller.ts` and `upload.controller.ts`.

Add devDependency:
```bash
cd packages/contract && pnpm add -D @zeltjs/validate-valibot@workspace:*
```

- [ ] **Step 3: Run all tests**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/rate-limit/ packages/contract/
git commit -m "refactor: migrate remaining packages to @zeltjs/validate-valibot"
```

---

### Task 18: Update Examples to Use validate-valibot

**Files:**
- Modify: `examples/hello/src/entry/hello.controller.ts`
- Modify: `examples/hello/zelt.config.ts`
- Modify: `examples/hello/package.json`
- Modify: `examples/drizzle-todo/src/todo/todo.controller.ts`
- Modify: `examples/drizzle-todo/zelt.config.ts`
- Modify: `examples/drizzle-todo/package.json`
- Modify: `examples/workers-url-shortener/src/url/url.controller.ts`
- Modify: `examples/workers-url-shortener/zelt.config.ts`
- Modify: `examples/workers-url-shortener/package.json`

- [ ] **Step 1: Update hello example**

Controller:
```ts
import { validated } from '@zeltjs/validate-valibot';
```

Config:
```ts
import { defineConfig } from '@zeltjs/openapi';
import { valibotAdapter } from '@zeltjs/validate-valibot/openapi';

export default defineConfig({
  controllers: ['./src/**/*.controller.ts'],
  dist: './generated',
  tsconfig: './tsconfig.json',
  requestValidator: valibotAdapter,
  // ...
});
```

Add dependency:
```bash
cd examples/hello && pnpm add @zeltjs/validate-valibot@workspace:*
```

- [ ] **Step 2: Repeat for drizzle-todo example**

- [ ] **Step 3: Repeat for workers-url-shortener example**

- [ ] **Step 4: Run tests for all examples**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add examples/
git commit -m "refactor(examples): migrate to @zeltjs/validate-valibot"
```

---

### Task 19: Final Verification and Cleanup

- [ ] **Step 1: Verify no valibot in core source**

Run: `grep -r "from 'valibot'" packages/core/src/ --include="*.ts" | grep -v ".test.ts"`
Expected: No output

- [ ] **Step 2: Full build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: Full test suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 4: Typecheck all packages**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: validate-valibot separation complete"
```
