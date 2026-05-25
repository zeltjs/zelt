import type { TypedPropertyInfo, TypeInfo } from '@zeltjs/decorator-metadata/inspect';
import { match, P } from 'ts-pattern';

import type { JsonSchema } from './schema-adapter';

type SchemaContext = {
  readonly definitions: Map<string, JsonSchema>;
};

const primitiveMap: Record<string, string> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  null: 'null',
  undefined: 'undefined',
};

const convertProperty = (prop: TypedPropertyInfo, ctx: SchemaContext): JsonSchema =>
  convertTypeInfo(prop.type, ctx);

const convertProperties = (
  props: readonly TypedPropertyInfo[],
  ctx: SchemaContext,
): { properties: Record<string, JsonSchema>; required: string[] } => {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const prop of props) {
    properties[prop.name] = convertProperty(prop, ctx);
    if (!prop.optional) {
      required.push(prop.name);
    }
  }

  return { properties, required };
};

const convertUnion = (type: TypeInfo & { kind: 'union' }, ctx: SchemaContext): JsonSchema => {
  const nullIndex = type.types.findIndex((t) => t.kind === 'primitive' && t.type === 'null');
  const undefinedIndex = type.types.findIndex(
    (t) => t.kind === 'primitive' && t.type === 'undefined',
  );

  const nonNullTypes = type.types.filter((_, i) => i !== nullIndex && i !== undefinedIndex);

  if (nonNullTypes.length === 1 && (nullIndex >= 0 || undefinedIndex >= 0)) {
    const first = nonNullTypes[0];
    if (first) {
      const inner = convertTypeInfo(first, ctx);
      return { ...inner, nullable: true };
    }
  }

  return { oneOf: type.types.map((t) => convertTypeInfo(t, ctx)) };
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
