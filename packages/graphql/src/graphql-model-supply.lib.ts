import type { ModelTypeReader } from './graphql-model-checker.lib';
import { withoutNullish } from './graphql-model-checker.lib';
import { readPick } from './graphql-model-pick.lib';
import type { Result } from './graphql-model-read.lib';
import { ok, rejected } from './graphql-model-read.lib';

type Type = import('typescript').Type;

const NOT_A_SUPPLY = 'provider result must be Model or Pick<Model, keys>';

const pickedKeys = (
  type: Type,
  model: Type,
  reader: ModelTypeReader,
): Result<readonly string[]> => {
  const pick = readPick(type, reader);
  if (pick.kind === 'rejected') return pick;
  if (pick.kind === 'absent' || pick.value.model !== model) return rejected(NOT_A_SUPPLY);
  return ok(pick.value.keys);
};

/**
 * What a provider supplies per id: `Model` supplies every property and `Pick<Model, keys>`
 * supplies `keys`. The id is already the input, so `keys` need not repeat it.
 * An id promises that its model exists, so a provider cannot answer `null`.
 */
export const readSupply = (
  value: Type,
  model: Type,
  reader: ModelTypeReader,
): Result<readonly string[]> => {
  const split = withoutNullish(value, reader);
  if (split.nullable)
    return rejected('provider result cannot be null; throw when a requested id has no data');
  if (split.undefinable) return rejected(NOT_A_SUPPLY);
  if (split.type === model)
    return ok(reader.checker.getPropertiesOfType(model).map((symbol) => symbol.name));
  return pickedKeys(split.type, model, reader);
};
