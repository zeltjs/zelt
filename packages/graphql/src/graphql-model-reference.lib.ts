import type { GraphqlModelResultShape } from './graphql-model.types';
import type { ModelTypeReader } from './graphql-model-checker.lib';
import { arrayElement, typeText, withoutNullish } from './graphql-model-checker.lib';
import { readPick } from './graphql-model-pick.lib';
import type { Read } from './graphql-model-read.lib';
import { ok, rejected } from './graphql-model-read.lib';

type Type = import('typescript').Type;

/** `X`, `X | null`, `readonly X[]`, `readonly (X | null)[] | null`: X and the shape around it. */
export type Shaped = {
  readonly target: Type;
  readonly shape: GraphqlModelResultShape;
  /** GraphQL has no `undefined`; the runtime only accepts what the shape allows. */
  readonly undefinable: boolean;
};

export const readShape = (type: Type, reader: ModelTypeReader): Shaped => {
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

/** A model reference: `Pick<Model, 'id'>` in one of the shapes above. */
export type Reference = { readonly model: Type; readonly shape: GraphqlModelResultShape };

export const readReference = (type: Type, reader: ModelTypeReader): Read<Reference> => {
  const shaped = readShape(type, reader);
  const pick = readPick(shaped.target, reader);
  if (pick.kind !== 'ok') return pick;
  const { model, keys } = pick.value;
  if (keys.length !== 1 || keys[0] !== 'id')
    return rejected(
      `must return Pick<Model, 'id'>, an array of it, or a nullable form; got ${typeText(type, reader)}`,
    );
  if (shaped.undefinable) return rejected('references cannot be undefined; return null instead');
  return ok({ model, shape: shaped.shape });
};

/** A reference fits a declared shape when it is never less null-safe or of another cardinality. */
export const fitsShape = (
  actual: GraphqlModelResultShape,
  declared: GraphqlModelResultShape,
): boolean => {
  if (actual.nullable && !declared.nullable) return false;
  if (actual.kind === 'one' || declared.kind === 'one') return actual.kind === declared.kind;
  return !actual.itemNullable || declared.itemNullable;
};
