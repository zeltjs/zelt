import type { GraphqlModelValue } from './graphql-model.types';
import type { ModelTypeReader } from './graphql-model-checker.lib';
import { arrayElement, withoutNullish } from './graphql-model-checker.lib';

type Type = import('typescript').Type;

// `ID` is `string` plus an optional brand, so it is recognized by that brand rather than by name.
const isGraphqlId = (type: Type, reader: ModelTypeReader): boolean => {
  const { checker } = reader;
  const brand = checker.getPropertyOfType(type, '__zeltGraphqlScalar');
  if (!brand || !checker.isTypeAssignableTo(type, checker.getStringType())) return false;
  const value = checker.getNonNullableType(checker.getTypeOfSymbol(brand));
  return value.isStringLiteral() && value.value === 'ID';
};

const scalarValue = (type: Type, reader: ModelTypeReader): GraphqlModelValue => {
  const { flags } = type;
  const { TypeFlags } = reader.ts;
  if (isGraphqlId(type, reader)) return { kind: 'scalar', name: 'ID' };
  if (flags & TypeFlags.BooleanLike) return { kind: 'scalar', name: 'boolean' };
  if (flags & TypeFlags.StringLike) return { kind: 'scalar', name: 'string' };
  if (flags & TypeFlags.NumberLike) return { kind: 'scalar', name: 'number' };
  return { kind: 'opaque' };
};

const isBooleanUnion = (type: Type, reader: ModelTypeReader): boolean =>
  type.isUnion() &&
  type.types.every((member) => Boolean(member.flags & reader.ts.TypeFlags.BooleanLike));

const nonNullValue = (type: Type, reader: ModelTypeReader): GraphqlModelValue => {
  const element = arrayElement(type, reader);
  if (element) return { kind: 'array', item: readModelValue(element, reader) };
  if (isBooleanUnion(type, reader)) return { kind: 'scalar', name: 'boolean' };
  return type.isUnion() ? { kind: 'opaque' } : scalarValue(type, reader);
};

/**
 * The value a model property declares: `ID`, `string`, `number`, `boolean`, their arrays and
 * nullable forms. Anything else is opaque, which only private (`$`) properties may hold.
 */
export const readModelValue = (type: Type, reader: ModelTypeReader): GraphqlModelValue => {
  const split = withoutNullish(type, reader);
  const value = nonNullValue(split.type, reader);
  const nullable: GraphqlModelValue = split.nullable ? { kind: 'nullable', inner: value } : value;
  return split.undefinable ? { kind: 'optional', inner: nullable } : nullable;
};

export const isPublicValue = (value: GraphqlModelValue): boolean =>
  value.kind === 'scalar' ||
  ((value.kind === 'nullable' || value.kind === 'optional') && isPublicValue(value.inner)) ||
  (value.kind === 'array' && isPublicValue(value.item));
