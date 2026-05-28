import { toJsonSchema } from '@valibot/to-json-schema';
import type { JsonSchema, SchemaAdapter } from '@zeltjs/openapi';
import type { GenericSchema } from 'valibot';

// Access the ~standard.vendor marker without type predicates.
// Returns true only for genuine valibot schemas implementing Standard Schema.
function hasValibotVendor(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const record: Record<string, unknown> = { ...value };
  const marker = record['~standard'];
  if (typeof marker !== 'object' || marker === null) return false;
  const markerRecord: Record<string, unknown> = { ...marker };
  return markerRecord['vendor'] === 'valibot';
}

// Narrows unknown to GenericSchema after vendor check.
function narrowToValibotSchema(value: unknown): GenericSchema;
function narrowToValibotSchema(value: unknown): unknown {
  return value;
}

// Narrows the output of toJsonSchema to @zeltjs/openapi's JsonSchema.
function narrowToJsonSchema(value: unknown): JsonSchema;
function narrowToJsonSchema(value: unknown): unknown {
  return value;
}

export const valibotAdapter: SchemaAdapter = {
  toJsonSchema: (schema: unknown): JsonSchema => {
    if (!hasValibotVendor(schema)) {
      throw new Error(
        'Invalid valibot schema: expected valibot schema with ~standard.vendor="valibot"',
      );
    }
    return narrowToJsonSchema(toJsonSchema(narrowToValibotSchema(schema)));
  },
};
