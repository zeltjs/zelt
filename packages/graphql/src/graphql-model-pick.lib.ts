import type { ModelTypeReader } from './graphql-model-checker.lib';
import { isLibSymbol, typeText } from './graphql-model-checker.lib';
import type { Read } from './graphql-model-read.lib';
import { absent, ok, rejected } from './graphql-model-read.lib';

type Type = import('typescript').Type;

/** `Pick<Model, keys>`: the model it selects from and the selected property names. */
export type PickRef = { readonly model: Type; readonly keys: readonly string[] };

// Every instance of lib `Pick` keeps the mapped type declared inside `Pick` as its symbol,
// whatever alias names it, so Pick-ness does not depend on how the reference is written.
const isPickInstance = (type: Type, reader: ModelTypeReader): boolean =>
  Boolean(
    type.getSymbol()?.declarations?.some((declaration) => {
      const { parent } = declaration;
      return (
        reader.ts.isTypeAliasDeclaration(parent) &&
        isLibSymbol(reader.checker.getSymbolAtLocation(parent.name), 'Pick')
      );
    }),
  );

// A picked property keeps the declaration of the model property it copies, so the model is
// known even when the Pick is named through an alias that hides its type arguments.
const declaringModel = (type: Type, reader: ModelTypeReader): Type | undefined => {
  const owners = new Set(
    reader.checker
      .getPropertiesOfType(type)
      .map((property) => property.declarations?.[0]?.parent)
      .map((node) => (node ? reader.checker.getTypeAtLocation(node) : undefined)),
  );
  const [model, ...others] = owners;
  return others.length === 0 ? model : undefined;
};

/** Reads `Pick<Model, keys>`, whether written directly or named through an alias. */
export const readPick = (type: Type, reader: ModelTypeReader): Read<PickRef> => {
  if (!isPickInstance(type, reader)) return absent;
  const model = isLibSymbol(type.aliasSymbol, 'Pick')
    ? type.aliasTypeArguments?.[0]
    : declaringModel(type, reader);
  if (!model) return rejected(`cannot tell which model ${typeText(type, reader)} picks from`);
  const keys = reader.checker.getPropertiesOfType(type).map((property) => property.name);
  return ok({ model, keys });
};
