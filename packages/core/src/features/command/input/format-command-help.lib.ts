import { ZeltAppConfigurationError } from '../../../kernel';
import type {
  ArgDef,
  CommandInputSchema,
  OptionDef,
  SchemaDefinition,
} from './command-schema.types';
import { validateCommandSchema } from './validate-command-schema.lib';

const argumentUsage = (arg: ArgDef): string => {
  if (arg.variadic) return (arg.variadic.min ?? 0) > 0 ? `<${arg.name}...>` : `[${arg.name}...]`;
  return arg.optional ? `[${arg.name}]` : `<${arg.name}>`;
};

const optionUsage = (option: OptionDef): string => {
  const value = option.type === 'boolean' ? '' : ` <${option.name}>`;
  const token = `--${option.name}${value}`;
  return option.required ? token : `[${token}]`;
};

const argumentDetails = (arg: ArgDef): string => {
  const count = arg.variadic
    ? `${arg.variadic.min ?? 0} to ${arg.variadic.max ?? 'unlimited'} values`
    : arg.optional
      ? 'optional'
      : 'required';
  return `  ${argumentUsage(arg)} (${arg.type}, ${count})${arg.description ? ` — ${arg.description}` : ''}`;
};

const optionDefaultText = (option: OptionDef): string => {
  const defaultValue =
    option.default ?? (option.type === 'boolean' && !option.required ? false : undefined);
  return defaultValue === undefined ? '' : `, default: ${JSON.stringify(defaultValue)}`;
};

const optionDetails = (option: OptionDef): string => {
  const alias = option.alias === undefined ? '' : `, -${option.alias}`;
  return `  --${option.name}${alias} (${option.type}, ${option.required ? 'required' : 'optional'}${optionDefaultText(option)})${option.description ? ` — ${option.description}` : ''}`;
};

const definitionDetails = (schema: SchemaDefinition): string => {
  const parts: string[] = [];
  if (schema.args?.length) parts.push(`Arguments:\n${schema.args.map(argumentDetails).join('\n')}`);
  if (schema.options?.length)
    parts.push(`Options:\n${schema.options.map(optionDetails).join('\n')}`);
  return parts.join('\n\n');
};

/** @throws {ZeltAppConfigurationError} */
export const formatCommandHelp = (commandName: string, schema: CommandInputSchema): string => {
  const validation = validateCommandSchema(schema);
  if (!validation.ok) {
    throw new ZeltAppConfigurationError({
      reason: 'invalid_command_schema',
      details: validation.error,
    });
  }
  const branches = schema.kind === 'union' ? schema.schemas : [schema];
  const usages = branches.map(
    (branch) =>
      `  ${[commandName, ...(branch.args ?? []).map(argumentUsage), ...(branch.options ?? []).map(optionUsage)].join(' ')}`,
  );
  const details = branches
    .map((branch, index) => {
      const content = definitionDetails(branch);
      if (schema.kind === 'union')
        return `Alternative ${index + 1}:\n${content || '  No arguments or options'}`;
      return content;
    })
    .filter(Boolean);
  return [`Usage:\n${usages.join('\n')}`, ...details].join('\n\n');
};
