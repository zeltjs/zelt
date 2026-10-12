import type { CommandInputSchema, SchemaDefinition, VariadicDef } from './command-schema.types';

export type CommandSchemaValidationResult = { ok: true } | { ok: false; readonly error: string };
type OptionData = {
  readonly name: string;
  readonly type: string;
  readonly required?: boolean;
  readonly default?: unknown;
};
type ArgumentData = {
  readonly name: string;
  readonly optional?: boolean;
  readonly variadic?: VariadicDef;
};

const invalid = (error: string): CommandSchemaValidationResult => ({ ok: false, error });

const findDuplicate = (names: readonly string[]): string | undefined => {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) return name;
    seen.add(name);
  }
  return undefined;
};

const validateDefault = (option: OptionData): CommandSchemaValidationResult => {
  if (option.default === undefined) return { ok: true };
  if (typeof option.default !== option.type)
    return invalid(`Default for option --${option.name} must be ${option.type}`);
  if (typeof option.default === 'number' && !Number.isFinite(option.default)) {
    return invalid(`Default for option --${option.name} must be finite`);
  }
  return { ok: true };
};

const validateOption = (option: OptionData): CommandSchemaValidationResult => {
  if (option.required === true && option.default !== undefined) {
    return invalid(`Option --${option.name} cannot combine required with default`);
  }
  return validateDefault(option);
};

const validCount = (value: number): boolean => Number.isInteger(value) && value >= 0;

const validateCounts = (name: string, bounds: VariadicDef): CommandSchemaValidationResult => {
  const min = bounds.min === undefined ? 0 : bounds.min;
  const max = bounds.max;
  const validMax = max === undefined || (validCount(max) && max >= min);
  if (validCount(min) && validMax) return { ok: true };
  return invalid(
    `Invalid variadic count for ${name}: min and max must be non-negative integers with min <= max`,
  );
};

const validateArgument = (
  arg: ArgumentData,
  index: number,
  lastIndex: number,
): CommandSchemaValidationResult => {
  if (!arg.variadic) return { ok: true };
  if (index !== lastIndex) return invalid(`Variadic argument ${arg.name} must be last`);
  if (arg.optional) return invalid(`Variadic argument ${arg.name} cannot be optional; use min: 0`);
  return validateCounts(arg.name, arg.variadic);
};

const validateEntries = <T>(
  entries: readonly T[],
  validate: (entry: T, index: number) => CommandSchemaValidationResult,
): CommandSchemaValidationResult => {
  for (const [index, entry] of entries.entries()) {
    const result = validate(entry, index);
    if (!result.ok) return result;
  }
  return { ok: true };
};

const validateDefinition = (schema: SchemaDefinition): CommandSchemaValidationResult => {
  const args = schema.args ?? [];
  const options = schema.options ?? [];
  const duplicate = findDuplicate([...args, ...options].map((def) => def.name));
  if (duplicate !== undefined) return invalid(`Duplicate input name: ${duplicate}`);
  const tokens = options.flatMap((option) => [
    ...new Set([option.name, ...(option.alias === undefined ? [] : [option.alias])]),
  ]);
  const duplicateToken = findDuplicate(tokens);
  if (duplicateToken !== undefined)
    return invalid(`Duplicate option name or alias: ${duplicateToken}`);
  const optionResult = validateEntries(options, validateOption);
  if (!optionResult.ok) return optionResult;
  return validateEntries(args, (arg, index) => validateArgument(arg, index, args.length - 1));
};

export const validateCommandSchema = (
  schema: CommandInputSchema,
): CommandSchemaValidationResult => {
  if (schema.kind !== 'union') return validateDefinition(schema);
  if (schema.schemas.length < 2) return invalid('cliUnion requires at least two schemas');
  for (const [index, branch] of schema.schemas.entries()) {
    const result = validateDefinition(branch);
    if (!result.ok) return invalid(`Union branch ${index + 1}: ${result.error}`);
  }
  return { ok: true };
};
