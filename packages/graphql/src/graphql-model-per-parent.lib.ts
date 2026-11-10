import type { ModelTypeReader } from './graphql-model-checker.lib';
import { isPromiseLike, mapEntry } from './graphql-model-checker.lib';
import type { Parent } from './graphql-model-parent.lib';
import type { Result } from './graphql-model-read.lib';
import { ok, rejected } from './graphql-model-read.lib';

type Type = import('typescript').Type;

const isModelId = (key: Type, model: Type, reader: ModelTypeReader): boolean => {
  const { checker } = reader;
  const symbol = checker.getPropertyOfType(model, 'id');
  const id = symbol && checker.getTypeOfSymbol(symbol);
  return Boolean(id && checker.isTypeAssignableTo(key, id) && checker.isTypeAssignableTo(id, key));
};

/**
 * The result for one parent: the return value itself for a single parent, or the value of
 * `ReadonlyMap<Model['id'], T>` for a batch of parents.
 */
export const readPerParent = (
  returned: Type,
  parent: Parent,
  reader: ModelTypeReader,
): Result<Type> => {
  if (!parent.batch) return ok(returned);
  const entry = mapEntry(returned, reader);
  if (!entry) return rejected('batch methods must return a Map or ReadonlyMap keyed by parent id');
  const [key, value] = entry;
  if (!isModelId(key, parent.ref.model, reader))
    return rejected('Map key must match model id type');
  if (isPromiseLike(value, reader)) return rejected('batch Map values cannot be Promise');
  return ok(value);
};
