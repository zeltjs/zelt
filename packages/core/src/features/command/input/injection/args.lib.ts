import { ZeltCommandExecutionError } from '../../../../kernel';
import type { InferSchema, SchemaDefinition } from '../command-schema.types';
import { bindCommandInput, getCommandContext } from '../index';

/** @throws {ZeltContextNotAvailableError | ZeltCommandExecutionError} */
export const args = <S extends SchemaDefinition>(schema: S): InferSchema<S> => {
  const { commandName, argv } = getCommandContext();

  const parseResult = bindCommandInput(argv, schema);
  if (!parseResult.ok) {
    throw new ZeltCommandExecutionError({
      reason: 'argv_parse_error',
      commandName,
      details: parseResult.error,
    });
  }

  return parseResult.parsed as InferSchema<S>;
};
