import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { toJsonSchema } from '@valibot/to-json-schema';
import * as v from 'valibot';

import type { RequestSchemaRef, ValidationTarget } from '../analyzer/handler';

export type RequestSchemaJson =
  | {
      kind: 'ref';
      readonly name: string;
      readonly schema: unknown;
      readonly target: ValidationTarget;
    }
  | { kind: 'inline'; readonly schema: unknown; readonly target: ValidationTarget }
  | { kind: 'none' };

type AnyValibotSchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>;

// dynamic import 由来の `unknown` から valibot schema を判別するための meta-schema。
// valibot schema 値はすべて `{ kind: 'schema', type, async, ... }` の形を持つので
// 最低限 toJsonSchema が要求する 3 fields の存在を runtime に確認する。
const valibotSchemaShape = v.object({
  kind: v.literal('schema'),
  type: v.string(),
  async: v.boolean(),
});

// 公開 overload は AnyValibotSchema を返すが impl signature は unknown を返す。
// 呼び出し側で runtime に safeParse で valibot schema 性を確認した値のみを渡し、
// 関数 overload trick で `as` を使わずに型を橋渡しする (response.ts の makeJson と同じ pattern)。
function narrowToValibotSchema(value: unknown): AnyValibotSchema;
function narrowToValibotSchema(value: unknown): unknown {
  return value;
}

// dynamic `import()` の戻り値は `any` 扱い (TS 仕様)。型情報を捨ててから unknown 経由で扱う。
const dynamicImport = async (url: string): Promise<unknown> => import(url);

const importNamedExport = async (modulePath: string, exportName: string): Promise<unknown> => {
  const url = pathToFileURL(resolve(modulePath)).href;
  const mod = await dynamicImport(url);
  if (typeof mod !== 'object' || mod === null) {
    throw new Error(`zelt/openapi: ${modulePath} did not export an object module`);
  }
  const namespace: Record<string, unknown> = { ...mod };
  const value = namespace[exportName];
  if (value === undefined) {
    throw new Error(`zelt/openapi: ${exportName} not found in ${modulePath}`);
  }
  return value;
};

// `kind: 'valibot-named'` の場合、対象 module を dynamic import して
// named export を runtime resolve し、valibot schema 値を取り出して JSON Schema 化する。
// `kind: 'valibot-inline'` は MVP 非対応 (named export への抽出を要求)。
export const resolveRequestSchema = async (ref: RequestSchemaRef): Promise<RequestSchemaJson> => {
  if (ref.kind === 'none') return { kind: 'none' };
  if (ref.kind === 'valibot-inline') {
    throw new Error(
      'zelt/openapi: validated() with inline schema is not supported in MVP. Extract the schema to a module-level export.',
    );
  }
  const value = await importNamedExport(ref.module, ref.exportName);
  const parsed = v.safeParse(valibotSchemaShape, value);
  if (!parsed.success) {
    throw new Error(
      `zelt/openapi: ${ref.exportName} in ${ref.module} is not a valibot schema (validated() expects a valibot schema)`,
    );
  }
  const schema = narrowToValibotSchema(value);
  return { kind: 'ref', name: ref.exportName, schema: toJsonSchema(schema), target: ref.target };
};
