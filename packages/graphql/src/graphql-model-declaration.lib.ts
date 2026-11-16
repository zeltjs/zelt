import type { GraphqlModelProperty } from './graphql-model.types';
import type { ModelTypeReader } from './graphql-model-checker.lib';
import { typeText } from './graphql-model-checker.lib';
import type { Result } from './graphql-model-read.lib';
import { ok, rejected } from './graphql-model-read.lib';
import { isPublicValue, readModelValue } from './graphql-model-value.lib';

type Type = import('typescript').Type;
type Symbol = import('typescript').Symbol;

/** A model type: a named, non-generic object type whose properties are its fields. */
export type ModelDeclaration = {
  readonly name: string;
  readonly type: Type;
  readonly properties: ReadonlyMap<string, Symbol>;
};

export const isPublicName = (name: string): boolean =>
  !name.startsWith('__') && /^[_A-Za-z][_0-9A-Za-z]*$/.test(name);

const ANONYMOUS_SYMBOLS = new Set([undefined, '__type', '__object']);

const namedObject = (type: Type, reader: ModelTypeReader): string | undefined => {
  const isGeneric = (type.aliasTypeArguments ?? []).length > 0;
  const name = (type.aliasSymbol ?? type.getSymbol())?.name;
  if (!(type.flags & reader.ts.TypeFlags.Object) || isGeneric) return undefined;
  return ANONYMOUS_SYMBOLS.has(name) ? undefined : name;
};

export const readModelDeclaration = (
  type: Type,
  reader: ModelTypeReader,
): Result<ModelDeclaration> => {
  const name = namedObject(type, reader);
  if (name === undefined)
    return rejected(`model must be a named object type; got ${typeText(type, reader)}`);
  if (!isPublicName(name)) return rejected(`invalid GraphQL model name ${name}`);
  const properties = new Map(
    reader.checker.getPropertiesOfType(type).map((symbol) => [symbol.name, symbol]),
  );
  return ok({ name, type, properties });
};

/** A property is public unless its name starts with `$`; public ones must have a GraphQL value. */
export const readModelProperty = (
  model: ModelDeclaration,
  name: string,
  reader: ModelTypeReader,
): Result<GraphqlModelProperty> => {
  const symbol = model.properties.get(name);
  if (!symbol) return rejected(`${model.name} has no property ${name}`);
  const optional = Boolean(symbol.flags & reader.ts.SymbolFlags.Optional);
  const value = readModelValue(reader.checker.getTypeOfSymbol(symbol), reader);
  if (name.startsWith('$')) return ok({ name, optional, value });
  if (!isPublicName(name)) return rejected(`invalid public property ${name}`);
  if (!isPublicValue(value)) return rejected(`unsupported public property ${model.name}.${name}`);
  return ok({ name, optional, value });
};

export const isScalarId = (property: GraphqlModelProperty): boolean =>
  property.name === 'id' &&
  !property.optional &&
  property.value.kind === 'scalar' &&
  (property.value.name === 'ID' || property.value.name === 'string');
