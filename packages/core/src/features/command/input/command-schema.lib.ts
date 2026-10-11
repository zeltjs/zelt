import { ZeltAppConfigurationError } from '../../../kernel';
import type { SchemaConstraint, SchemaDefinition, SchemaUnion } from './command-schema.types';
import { validateCommandSchema } from './validate-command-schema.lib';

/** @throws {ZeltAppConfigurationError} */
export const cliSchema = <const T extends SchemaDefinition>(schema: T & SchemaConstraint<T>): T => {
  const result = validateCommandSchema(schema);
  if (!result.ok)
    throw new ZeltAppConfigurationError({
      reason: 'invalid_command_schema',
      details: result.error,
    });
  return schema;
};

type ValidBranches<T extends readonly SchemaDefinition[]> = {
  [K in keyof T]: T[K] & SchemaConstraint<T[K]>;
};

/** @throws {ZeltAppConfigurationError} */
export const cliUnion = <
  const T extends readonly [SchemaDefinition, SchemaDefinition, ...SchemaDefinition[]],
>(
  schemas: T & ValidBranches<T>,
): SchemaUnion<T> => {
  const union: SchemaUnion<T> = { kind: 'union', schemas };
  const result = validateCommandSchema(union);
  if (!result.ok)
    throw new ZeltAppConfigurationError({
      reason: 'invalid_command_schema',
      details: result.error,
    });
  return union;
};
