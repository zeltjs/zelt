import type { ModelTypeReader } from './graphql-model-checker.lib';
import { withoutNullish } from './graphql-model-checker.lib';
import { readPick } from './graphql-model-pick.lib';
import type { Result } from './graphql-model-read.lib';
import { ok, rejected } from './graphql-model-read.lib';

type Type = import('typescript').Type;

const NOT_A_SUPPLY = 'provider result must be Model or Pick<Model, keys>, optionally | null';

const pickedKeys = (
  type: Type,
  model: Type,
  reader: ModelTypeReader,
): Result<readonly string[]> => {
  const pick = readPick(type, reader);
  if (pick.kind === 'rejected') return pick;
  if (pick.kind === 'absent' || pick.value.model !== model) return rejected(NOT_A_SUPPLY);
  if (!pick.value.keys.includes('id')) return rejected('provider Pick must include id');
  return ok(pick.value.keys);
};

/**
 * What a provider supplies per id: `Model` supplies every property and `Pick<Model, keys>`
 * supplies `keys`. Either may be `| null`, where `null` means the id does not exist.
 */
export const readSupply = (
  value: Type,
  model: Type,
  reader: ModelTypeReader,
): Result<readonly string[]> => {
  const split = withoutNullish(value, reader);
  if (split.undefinable) return rejected(NOT_A_SUPPLY);
  if (split.type === model)
    return ok(reader.checker.getPropertiesOfType(model).map((symbol) => symbol.name));
  return pickedKeys(split.type, model, reader);
};
