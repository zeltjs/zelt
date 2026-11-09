import type { GraphqlModelResultShape, GraphqlModelValue } from './graphql-model.types';

type TS = typeof import('typescript');
type Type = import('typescript').Type;
type Checker = import('typescript').TypeChecker;

/** Reads resolver signatures through the type checker only; type annotations are never parsed. */
export type ModelTypeReader = { readonly checker: Checker; readonly ts: TS };

export type ModelRef = { readonly model: Type; readonly keys: readonly string[] };

export type ReferenceType = {
  readonly target: Type;
  readonly shape: GraphqlModelResultShape;
  /** Whether the reference or its list items can be `undefined`, which GraphQL cannot carry. */
  readonly undefinable: boolean;
};

const LIB_FILE = /[\\/]typescript[\\/]lib[\\/]lib\..*\.d\.ts$/;

const isLibSymbol = (symbol: import('typescript').Symbol | undefined, name: string): boolean =>
  symbol?.name === name &&
  Boolean(symbol.declarations?.some((d) => LIB_FILE.test(d.getSourceFile().fileName)));

export const awaited = (type: Type, reader: ModelTypeReader): Type =>
  reader.checker.getAwaitedType(type) ?? type;

export const isPromiseLike = (type: Type, reader: ModelTypeReader): boolean =>
  awaited(type, reader) !== type;

/** Splits `T | null | undefined` into `T` and whether `null` / `undefined` were present. */
export const withoutNullish = (
  type: Type,
  reader: ModelTypeReader,
): { readonly type: Type; readonly nullable: boolean; readonly undefinable: boolean } => {
  if (!type.isUnion()) return { type, nullable: false, undefinable: false };
  return {
    type: reader.checker.getNonNullableType(type),
    nullable: type.types.some((member) => Boolean(member.flags & reader.ts.TypeFlags.Null)),
    undefinable: type.types.some((member) => Boolean(member.flags & reader.ts.TypeFlags.Undefined)),
  };
};

export const arrayElement = (type: Type, reader: ModelTypeReader): Type | undefined =>
  reader.checker.isArrayType(type)
    ? reader.checker.getIndexTypeOfType(type, reader.ts.IndexKind.Number)
    : undefined;

const parameterTypes = (type: Type, reader: ModelTypeReader): readonly Type[] => {
  const [signature] = type.getCallSignatures();
  return (signature?.getParameters() ?? []).map((parameter) =>
    reader.checker.getTypeOfSymbol(parameter),
  );
};

/**
 * Returns `[key, value]` of a TypeScript `Map` / `ReadonlyMap`; look-alike types are rejected.
 * The entry types are read from `forEach`'s callback because it exposes `V` and `K` unchanged.
 */
export const mapEntry = (
  type: Type,
  reader: ModelTypeReader,
): readonly [Type, Type] | undefined => {
  const symbol = type.getSymbol();
  if (!isLibSymbol(symbol, 'Map') && !isLibSymbol(symbol, 'ReadonlyMap')) return undefined;
  const forEach = reader.checker.getPropertyOfType(type, 'forEach');
  const [callback] = forEach ? parameterTypes(reader.checker.getTypeOfSymbol(forEach), reader) : [];
  const [value, key] = callback ? parameterTypes(callback, reader) : [];
  return key && value ? [key, value] : undefined;
};

const literalKeys = (type: Type): readonly string[] | undefined => {
  const members = type.isUnion() ? type.types : [type];
  const keys = members.map((member) => (member.isStringLiteral() ? member.value : undefined));
  return keys.every((key) => key !== undefined) ? keys : undefined;
};

/**
 * Recognizes `Pick<Model, keys>` applied directly. The checker keeps the `Pick` alias only in
 * that form, so references through another alias or generic are reported instead of guessed.
 */
export const modelRef = (type: Type): ModelRef | undefined => {
  if (!isLibSymbol(type.aliasSymbol, 'Pick')) return undefined;
  const [model, keyType, ...rest] = type.aliasTypeArguments ?? [];
  const keys = keyType && literalKeys(keyType);
  return model && keys && rest.length === 0 ? { model, keys } : undefined;
};

/**
 * Whether the type is an instance of lib `Pick`, however it is named. Instances keep the mapped
 * type declared in `Pick` as their symbol, so references through another alias are still found.
 */
export const isPickInstance = (type: Type, reader: ModelTypeReader): boolean =>
  Boolean(
    type.getSymbol()?.declarations?.some((declaration) => {
      const { parent } = declaration;
      return (
        reader.ts.isTypeAliasDeclaration(parent) &&
        isLibSymbol(reader.checker.getSymbolAtLocation(parent.name), 'Pick')
      );
    }),
  );

const ANONYMOUS_SYMBOLS = new Set([undefined, '__type', '__object']);

/** Model types are named, non-generic object types; their name becomes the GraphQL type name. */
export const modelName = (type: Type, reader: ModelTypeReader): string | undefined => {
  const isGeneric = (type.aliasTypeArguments ?? []).length > 0;
  if (!(type.flags & reader.ts.TypeFlags.Object) || isGeneric) return undefined;
  const name = (type.aliasSymbol ?? type.getSymbol())?.name;
  return ANONYMOUS_SYMBOLS.has(name) ? undefined : name;
};

/** Decomposes `X`, `X | null`, `readonly X[]`, `readonly (X | null)[] | null` into X and its shape. */
export const referenceType = (type: Type, reader: ModelTypeReader): ReferenceType => {
  const outer = withoutNullish(type, reader);
  const element = arrayElement(outer.type, reader);
  if (!element)
    return {
      target: outer.type,
      shape: { kind: 'one', nullable: outer.nullable },
      undefinable: outer.undefinable,
    };
  const inner = withoutNullish(element, reader);
  return {
    target: inner.type,
    shape: { kind: 'many', nullable: outer.nullable, itemNullable: inner.nullable },
    undefinable: outer.undefinable || inner.undefinable,
  };
};

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
  if (element) return { kind: 'array', item: modelValue(element, reader) };
  if (isBooleanUnion(type, reader)) return { kind: 'scalar', name: 'boolean' };
  return type.isUnion() ? { kind: 'opaque' } : scalarValue(type, reader);
};

/** Maps a declared property type onto the closed set of GraphQL model values; the rest is opaque. */
export const modelValue = (type: Type, reader: ModelTypeReader): GraphqlModelValue => {
  const split = withoutNullish(type, reader);
  const value = nonNullValue(split.type, reader);
  const nullable: GraphqlModelValue = split.nullable ? { kind: 'nullable', inner: value } : value;
  return split.undefinable ? { kind: 'optional', inner: nullable } : nullable;
};

export const isPublicValue = (value: GraphqlModelValue): boolean =>
  value.kind === 'scalar' ||
  ((value.kind === 'nullable' || value.kind === 'optional') && isPublicValue(value.inner)) ||
  (value.kind === 'array' && isPublicValue(value.item));
