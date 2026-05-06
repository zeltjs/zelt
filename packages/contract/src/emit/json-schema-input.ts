// packages/contract/src/emit/json-schema-input.ts
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { toJsonSchema } from '@valibot/to-json-schema';
import * as v from 'valibot';
import { okAsync, errAsync, ResultAsync } from 'neverthrow';

import type { EmitError } from '../errors';
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

const valibotSchemaShape = v.object({
  kind: v.literal('schema'),
  type: v.string(),
  async: v.boolean(),
});

function narrowToValibotSchema(value: unknown): AnyValibotSchema;
function narrowToValibotSchema(value: unknown): unknown {
  return value;
}

const dynamicImport = async (url: string): Promise<unknown> => import(url);

const importNamedExport = (
  modulePath: string,
  exportName: string,
): ResultAsync<unknown, EmitError> => {
  const url = pathToFileURL(resolve(modulePath)).href;

  return ResultAsync.fromPromise(dynamicImport(url), () => ({
    type: 'MODULE_NOT_OBJECT' as const,
    modulePath,
  })).andThen((mod) => {
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

export const resolveRequestSchema = (
  ref: RequestSchemaRef,
): ResultAsync<RequestSchemaJson, EmitError> => {
  if (ref.kind === 'none') return okAsync({ kind: 'none' });
  if (ref.kind === 'valibot-inline') {
    return errAsync({ type: 'INLINE_SCHEMA_NOT_SUPPORTED' });
  }

  return importNamedExport(ref.module, ref.exportName).andThen((value) => {
    const parsed = v.safeParse(valibotSchemaShape, value);
    if (!parsed.success) {
      return errAsync({
        type: 'NOT_VALIBOT_SCHEMA' as const,
        exportName: ref.exportName,
        modulePath: ref.module,
      });
    }
    const schema = narrowToValibotSchema(value);
    return okAsync({
      kind: 'ref' as const,
      name: ref.exportName,
      schema: toJsonSchema(schema),
      target: ref.target,
    });
  });
};
