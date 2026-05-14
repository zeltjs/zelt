import { getCommandContext } from '../command-context';
import type { InferSchema, SchemaDefinition } from '../schema';

type CommandWithSchema = { schema: SchemaDefinition };

/** @throws {ZeltContextNotAvailableError} */
export const args = <T extends CommandWithSchema>(_commandClass: T): InferSchema<T['schema']> => {
  const ctx = getCommandContext();
  const result: InferSchema<T['schema']> = ctx.parsedArgs as InferSchema<T['schema']>;
  return result;
};
