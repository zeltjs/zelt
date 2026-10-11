import { ZeltAppConfigurationError, ZeltCommandExecutionError } from '../../../../kernel';
import type { CommandInputSchema, InferSchema } from '../command-schema.types';
import { bindCommandInput, getCommandContext } from '../index';

/** @throws {ZeltContextNotAvailableError | ZeltCommandExecutionError | ZeltAppConfigurationError} */
export const args = <S extends CommandInputSchema>(schema: S): InferSchema<S> => {
  const { commandName, argv } = getCommandContext();

  const parseResult = bindCommandInput(argv, schema);
  if (!parseResult.ok) {
    if (parseResult.kind === 'schema') {
      throw new ZeltAppConfigurationError({
        reason: 'invalid_command_schema',
        details: parseResult.error,
      });
    }
    throw new ZeltCommandExecutionError({
      reason: 'argv_parse_error',
      commandName,
      details: parseResult.error,
    });
  }

  return parseResult.parsed as InferSchema<S>;
};
