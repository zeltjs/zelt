// packages/contract/src/emit/json-schema-input.ts
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
