import { getCommandContext } from '../command-context';
import type { InferSchema, SchemaDefinition } from '../schema';

type CommandWithSchema = { schema: SchemaDefinition };

/** @throws {ZeltContextNotAvailableError} */
export const args = <T extends CommandWithSchema>(_commandClass: T): InferSchema<T['schema']> =>
  getCommandContext().parsedArgs as InferSchema<T['schema']>;
