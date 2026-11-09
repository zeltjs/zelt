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

const literalKeys = (type: Type): readonly string[] | undefined => {
  const members = type.isUnion() ? type.types : [type];
  const keys = members.map((member) => (member.isStringLiteral() ? member.value : undefined));
  return keys.every((key) => key !== undefined) ? keys : undefined;
};

/**
 * Reads `Pick<Model, keys>`. Only the directly written form exposes its arguments, so a Pick
 * named through another alias is rejected rather than guessed.
 */
export const readPick = (type: Type, reader: ModelTypeReader): Read<PickRef> => {
  if (!isPickInstance(type, reader)) return absent;
  const direct = isLibSymbol(type.aliasSymbol, 'Pick');
  const [model, keyType] = direct ? (type.aliasTypeArguments ?? []) : [];
  if (!model || !keyType)
    return rejected(`Pick<Model, keys> must be written directly; got ${typeText(type, reader)}`);
  const keys = literalKeys(keyType);
  if (!keys) return rejected('Pick keys must be string literals');
  return ok({ model, keys });
};
