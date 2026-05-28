import type { TypedPropertyInfo, TypeInfo } from '@zeltjs/decorator-metadata/inspect';
import { match, P } from 'ts-pattern';

import type { JsonSchema } from './schema.types';

type SchemaContext = {
  readonly definitions: Map<string, JsonSchema>;
};

const primitiveMap: Record<string, string> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  null: 'null',
};

const convertProperty = (prop: TypedPropertyInfo, ctx: SchemaContext): JsonSchema =>
  convertTypeInfo(prop.type, ctx);

// TypeScript surfaces `unique symbol` brand properties under names like
// `__@___zeltValidatedBrand@3023`. These are implementation details of branded
// types (ValidatedMarker, etc.) and must not leak into JSON Schema output.
const isInternalBrandProperty = (name: string): boolean => name.startsWith('__@');

const convertProperties = (
  props: readonly TypedPropertyInfo[],
  ctx: SchemaContext,
): { properties: Record<string, JsonSchema>; required: string[] } => {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const prop of props) {
    if (isInternalBrandProperty(prop.name)) continue;
    properties[prop.name] = convertProperty(prop, ctx);
    if (!prop.optional) {
      required.push(prop.name);
    }
  }

  return { properties, required };
};

// hono's TypedResponse<T, S, F> surfaces as an object type
// `{ _data: T; _status: S; _format: F }`. For OpenAPI we only care about the
// response body, so unwrap to `_data` when the shape matches.
const TYPED_RESPONSE_KEYS = new Set(['_data', '_status', '_format']);

const findTypedResponseDataType = (props: readonly TypedPropertyInfo[]): TypeInfo | undefined => {
  if (props.length !== TYPED_RESPONSE_KEYS.size) return undefined;
  let dataProp: TypedPropertyInfo | undefined;
  for (const prop of props) {
    if (!TYPED_RESPONSE_KEYS.has(prop.name)) return undefined;
    if (prop.name === '_data') dataProp = prop;
  }
  return dataProp?.type;
};

const isUndefinedType = (t: TypeInfo): boolean => t.kind === 'primitive' && t.type === 'undefined';

const isNullType = (t: TypeInfo): boolean => t.kind === 'primitive' && t.type === 'null';

// OpenAPI 3.1 (JSON Schema 2020-12) represents nullability via type arrays
// (`type: ['T', 'null']`) for primitives, or via `anyOf` when the base schema
// can't carry a `type` keyword (e.g. `$ref`). The OpenAPI 3.0 `nullable: true`
// keyword is not part of JSON Schema 2020-12 and is rejected by 3.1 validators.
const withNullableForPrimitive = (inner: JsonSchema): JsonSchema | undefined => {
  if (typeof inner.type === 'string') {
    return { ...inner, type: [inner.type, 'null'] };
  }
  return undefined;
};

const buildNullableSchema = (base: TypeInfo, ctx: SchemaContext): JsonSchema => {
  const inner = convertTypeInfo(base, ctx);
  return withNullableForPrimitive(inner) ?? { anyOf: [inner, { type: 'null' }] };
};

const convertUnion = (type: TypeInfo & { kind: 'union' }, ctx: SchemaContext): JsonSchema => {
  const nonUndefinedTypes = type.types.filter((t) => !isUndefinedType(t));

  if (nonUndefinedTypes.length === 0) return {};

  const first = nonUndefinedTypes[0];
  if (nonUndefinedTypes.length === 1 && first) return convertTypeInfo(first, ctx);

  const nonNullTypes = nonUndefinedTypes.filter((t) => !isNullType(t));
  const hasNull = nonUndefinedTypes.length !== nonNullTypes.length;
  const baseType = nonNullTypes[0];
  if (hasNull && nonNullTypes.length === 1 && baseType) {
    return buildNullableSchema(baseType, ctx);
  }

  return { anyOf: nonUndefinedTypes.map((t) => convertTypeInfo(t, ctx)) };
};

const convertTypeInfo = (type: TypeInfo, ctx: SchemaContext): JsonSchema =>
  match(type)
    .with({ kind: 'primitive' }, (t) => {
      const mapped = primitiveMap[t.type];
      return mapped ? { type: mapped } : {};
    })
    .with({ kind: 'literal' }, (t) => ({ const: t.value }))
    .with({ kind: 'array' }, (t) => ({ type: 'array', items: convertTypeInfo(t.items, ctx) }))
    .with({ kind: 'object' }, (t) => {
      const dataType = findTypedResponseDataType(t.properties);
      if (dataType) return convertTypeInfo(dataType, ctx);

      const { properties, required } = convertProperties(t.properties, ctx);
      return {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
      };
    })
    .with({ kind: 'union' }, (t) => convertUnion(t, ctx))
    .with({ kind: 'named', name: P.select() }, (name) => {
      ctx.definitions.set(name, {});
      return { $ref: `#/components/schemas/${name}` };
    })
    .with({ kind: 'ref', name: P.select() }, (name) => ({
      $ref: `#/components/schemas/${name}`,
    }))
    .with({ kind: 'promise' }, (t) => convertTypeInfo(t.inner, ctx))
    .with({ kind: 'unknown' }, () => ({}))
    .exhaustive();

export type ConvertResult = {
  readonly schema: JsonSchema;
  readonly namedTypes: readonly string[];
};

export const typeInfoToJsonSchema = (type: TypeInfo): ConvertResult => {
  const ctx: SchemaContext = { definitions: new Map() };
  const schema = convertTypeInfo(type, ctx);
  return {
    schema,
    namedTypes: [...ctx.definitions.keys()],
  };
};
