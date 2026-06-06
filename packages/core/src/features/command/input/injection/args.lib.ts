import type { InferSchema, SchemaDefinition } from '../command-schema.types';
import { getCommandContext } from '../index';

type CommandWithSchema = { schema: SchemaDefinition };

/** @throws {ZeltContextNotAvailableError} */
export const args = <T extends CommandWithSchema>(_commandClass: T): InferSchema<T['schema']> =>
  getCommandContext().parsedArgs as InferSchema<T['schema']>;
